alter table public.unresolved_questions
add column question_message_id uuid,
add column answer_message_id uuid,
add column answer_content text,
add column citations jsonb not null default '[]'::jsonb
  check (jsonb_typeof(citations) = 'array'),
add foreign key (question_message_id, organization_id)
  references public.messages(id, organization_id)
  on delete cascade,
add foreign key (answer_message_id, organization_id)
  references public.messages(id, organization_id)
  on delete cascade,
add constraint unresolved_questions_answer_message_id_key
  unique (answer_message_id),
add check (
  answer_content is null
  or char_length(btrim(answer_content)) between 1 and 20000
);

create table public.quality_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  conversation_id uuid not null,
  answer_message_id uuid not null,
  feedback_value text not null
    check (feedback_value in ('helpful', 'unhelpful')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete cascade,
  foreign key (answer_message_id, organization_id)
    references public.messages(id, organization_id)
    on delete cascade,
  unique (answer_message_id)
);

create index quality_feedback_organization_updated_at_idx
on public.quality_feedback(organization_id, updated_at desc);

alter table public.quality_feedback enable row level security;

create policy "members can view quality feedback"
on public.quality_feedback
for select
to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on table public.quality_feedback from anon;
grant select on table public.quality_feedback to authenticated;

create function private.create_unresolved_question_for_answer(
  target_answer_message_id uuid,
  target_trigger_type text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_unresolved_question_id uuid;
begin
  if target_trigger_type not in (
    'grounded_refusal',
    'negative_feedback'
  ) then
    raise exception 'unresolved question trigger type is invalid'
      using errcode = '22023';
  end if;

  insert into public.unresolved_questions (
    organization_id,
    conversation_id,
    question_message_id,
    answer_message_id,
    question,
    answer_content,
    citations,
    trigger_type,
    status
  )
  select
    answer.organization_id,
    answer.conversation_id,
    question.id,
    answer.id,
    question.content,
    answer.content,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'knowledgeSourceId',
            citation.knowledge_source_id,
            'title',
            citation.source_title,
            'url',
            citation.source_url
          )
          order by citation.created_at, citation.id
        )
        from public.citations as citation
        where citation.message_id = answer.id
          and citation.organization_id = answer.organization_id
      ),
      '[]'::jsonb
    ),
    target_trigger_type,
    'pending'
  from public.messages as answer
  cross join lateral (
    select visitor.id, visitor.content
    from public.messages as visitor
    where visitor.conversation_id = answer.conversation_id
      and visitor.organization_id = answer.organization_id
      and visitor.message_type = 'visitor_question'
      and visitor.status = 'completed'
      and visitor.created_at <= answer.created_at
    order by visitor.created_at desc, visitor.id desc
    limit 1
  ) as question
  where answer.id = target_answer_message_id
    and answer.message_type in (
      'grounded_answer',
      'grounded_refusal'
    )
    and answer.status = 'completed'
  on conflict (answer_message_id)
  do update set answer_message_id = excluded.answer_message_id
  returning id into created_unresolved_question_id;

  return created_unresolved_question_id;
end;
$$;

revoke all
on function private.create_unresolved_question_for_answer(uuid, text)
from public;

create function private.capture_grounded_refusal()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if
    new.message_type = 'grounded_refusal'
    and new.status = 'completed'
    and (
      old.message_type is distinct from new.message_type
      or old.status is distinct from new.status
    )
  then
    perform private.create_unresolved_question_for_answer(
      new.id,
      'grounded_refusal'
    );
  end if;

  return new;
end;
$$;

revoke all
on function private.capture_grounded_refusal()
from public;

create trigger capture_grounded_refusal_as_unresolved_question
after update of message_type, status
on public.messages
for each row
execute function private.capture_grounded_refusal();

create function public.submit_public_quality_feedback(
  assistant_public_id uuid,
  target_answer_message_id uuid,
  submitted_feedback_value text
)
returns table (
  quality_feedback_id uuid,
  unresolved_question_id uuid,
  feedback_value text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_answer public.messages%rowtype;
  saved_quality_feedback_id uuid;
  saved_unresolved_question_id uuid;
begin
  if submitted_feedback_value not in ('helpful', 'unhelpful') then
    raise exception 'quality feedback value is invalid'
      using errcode = '22023';
  end if;

  select answer.*
  into target_answer
  from public.messages as answer
  join public.conversations as conversation
    on conversation.id = answer.conversation_id
    and conversation.organization_id = answer.organization_id
  join public.assistants as assistant
    on assistant.id = conversation.assistant_id
    and assistant.organization_id = conversation.organization_id
  where answer.id = target_answer_message_id
    and assistant.public_id = assistant_public_id
    and answer.message_type in (
      'grounded_answer',
      'grounded_refusal'
    )
    and answer.status = 'completed';

  if target_answer.id is null then
    raise exception 'quality feedback target is invalid'
      using errcode = '22023';
  end if;

  insert into public.quality_feedback (
    organization_id,
    conversation_id,
    answer_message_id,
    feedback_value
  ) values (
    target_answer.organization_id,
    target_answer.conversation_id,
    target_answer.id,
    submitted_feedback_value
  )
  on conflict (answer_message_id)
  do update set
    feedback_value = excluded.feedback_value,
    updated_at = now()
  returning id into saved_quality_feedback_id;

  if submitted_feedback_value = 'unhelpful' then
    saved_unresolved_question_id :=
      private.create_unresolved_question_for_answer(
        target_answer.id,
        'negative_feedback'
      );
  end if;

  return query
  select
    saved_quality_feedback_id,
    saved_unresolved_question_id,
    submitted_feedback_value;
end;
$$;

revoke all
on function public.submit_public_quality_feedback(uuid, uuid, text)
from public;

grant execute
on function public.submit_public_quality_feedback(uuid, uuid, text)
to service_role;
