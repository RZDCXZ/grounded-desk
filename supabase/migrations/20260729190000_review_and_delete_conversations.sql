create function public.list_recent_conversations()
returns table (
  id uuid,
  created_at timestamptz,
  last_activity_at timestamptz,
  question_summary text,
  result_type text,
  feedback_value text,
  question_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    conversation.id,
    conversation.created_at,
    conversation.last_activity_at,
    first_question.content,
    recent_result.message_type,
    feedback.feedback_value,
    (
      select count(*)
      from public.messages as question_count_message
      where
        question_count_message.organization_id =
          conversation.organization_id
        and question_count_message.conversation_id = conversation.id
        and question_count_message.message_type = 'visitor_question'
    )
  from public.conversations as conversation
  join public.organization_members as membership
    on membership.organization_id = conversation.organization_id
    and membership.user_id = (select auth.uid())
    and membership.role = 'administrator'
  join lateral (
    select question.content
    from public.messages as question
    where
      question.organization_id = conversation.organization_id
      and question.conversation_id = conversation.id
      and question.message_type = 'visitor_question'
    order by question.created_at, question.id
    limit 1
  ) as first_question on true
  left join lateral (
    select result.id, result.message_type
    from public.messages as result
    where
      result.organization_id = conversation.organization_id
      and result.conversation_id = conversation.id
      and result.message_type in (
        'grounded_answer',
        'grounded_refusal',
        'technical_failure'
      )
      and result.status in ('completed', 'failed')
    order by result.created_at desc, result.id desc
    limit 1
  ) as recent_result on true
  left join public.quality_feedback as feedback
    on feedback.organization_id = conversation.organization_id
    and feedback.conversation_id = conversation.id
    and feedback.answer_message_id = recent_result.id
  where conversation.created_at >= now() - interval '30 days'
  order by conversation.last_activity_at desc, conversation.id desc;
$$;

revoke all
on function public.list_recent_conversations()
from public;

grant execute
on function public.list_recent_conversations()
to authenticated;

create function public.delete_admin_conversation(
  target_conversation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_organization_id uuid;
  deleted_conversation_id uuid;
begin
  select membership.organization_id
  into current_organization_id
  from public.organization_members as membership
  where membership.user_id = (select auth.uid())
    and membership.role = 'administrator'
  limit 1;

  if current_organization_id is null then
    raise exception 'administrator organization not found'
      using errcode = '42501';
  end if;

  delete from public.conversations as conversation
  where conversation.id = target_conversation_id
    and conversation.organization_id = current_organization_id
  returning conversation.id into deleted_conversation_id;

  if deleted_conversation_id is null then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;

  return deleted_conversation_id;
end;
$$;

revoke all
on function public.delete_admin_conversation(uuid)
from public;

grant execute
on function public.delete_admin_conversation(uuid)
to authenticated;
