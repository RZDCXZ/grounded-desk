alter table public.messages
drop constraint messages_message_type_check;

alter table public.messages
add constraint messages_message_type_check
check (
  message_type in (
    'visitor_question',
    'answer_retry',
    'grounded_answer',
    'grounded_refusal',
    'conversational_response',
    'clarification_request',
    'technical_failure'
  )
);

alter table public.messages
add column consumes_ai_budget boolean not null default false;

revoke update on table public.messages from authenticated;

grant update (
  message_type,
  content,
  status,
  created_at
)
on table public.messages
to authenticated;

update public.messages
set consumes_ai_budget = true
where message_type in (
  'visitor_question',
  'answer_retry'
);

alter table public.messages
add constraint messages_ai_budget_request_check
check (
  not consumes_ai_budget
  or message_type in (
    'visitor_question',
    'answer_retry'
  )
);

drop function public.begin_public_conversation(
  uuid,
  text,
  uuid,
  boolean,
  integer,
  integer
);

create function public.begin_public_conversation(
  assistant_public_id uuid,
  visitor_question text,
  requested_conversation_id uuid default null,
  retry_failed_question boolean default false,
  daily_message_budget integer default 500,
  context_message_limit integer default 6,
  request_uses_ai boolean default true
)
returns table (
  request_status text,
  conversation_id uuid,
  assistant_message_id uuid,
  organization_id uuid,
  assistant_id uuid,
  name text,
  service_scope text,
  tone text,
  human_contact_label text,
  human_contact_url text,
  context_messages jsonb,
  question_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  published_assistant public.assistants%rowtype;
  selected_conversation public.conversations%rowtype;
  created_assistant_message_id uuid;
  retried_failure_message_id uuid;
  retried_question_message_id uuid;
  request_state text := 'accepted';
  recent_context jsonb := '[]'::jsonb;
  existing_question_count integer := 0;
begin
  visitor_question := btrim(visitor_question);

  if
    visitor_question is null
    or char_length(visitor_question) not between 1 and 2000
  then
    raise exception 'visitor question is invalid' using errcode = '22023';
  end if;

  if
    daily_message_budget is null
    or daily_message_budget not between 1 and 1000000
  then
    raise exception 'daily AI request budget is invalid'
      using errcode = '22023';
  end if;

  if
    context_message_limit is null
    or context_message_limit not between 0 and 20
  then
    raise exception 'context message limit is invalid'
      using errcode = '22023';
  end if;

  if request_uses_ai is null then
    raise exception 'AI request classification is required'
      using errcode = '22023';
  end if;

  if retry_failed_question and requested_conversation_id is null then
    request_state := 'retry_not_available';
  end if;

  select assistant.*
  into published_assistant
  from public.assistants as assistant
  where assistant.public_id = assistant_public_id
    and assistant.status = 'published';

  if published_assistant.id is null then
    raise exception 'published assistant not found' using errcode = 'P0002';
  end if;

  if request_state = 'accepted' and requested_conversation_id is not null then
    select conversation.*
    into selected_conversation
    from public.conversations as conversation
    where conversation.id = requested_conversation_id
      and conversation.assistant_id = published_assistant.id
      and conversation.organization_id = published_assistant.organization_id
    for update;

    if selected_conversation.id is null then
      request_state := 'conversation_not_found';
    else
      select count(*)::integer
      into existing_question_count
      from public.messages as message
      where message.conversation_id = selected_conversation.id
        and message.organization_id = selected_conversation.organization_id
        and message.message_type = 'visitor_question';

      if exists (
        select 1
        from public.messages as message
        where message.conversation_id = selected_conversation.id
          and message.organization_id = selected_conversation.organization_id
          and message.message_type = 'grounded_answer'
          and message.status = 'pending'
      ) then
        request_state := 'answer_in_progress';
      elsif (
        select count(*)
        from public.messages as message
        where message.conversation_id = selected_conversation.id
          and message.organization_id = selected_conversation.organization_id
          and message.message_type in (
            'visitor_question',
            'answer_retry'
          )
          and message.created_at >= clock_timestamp() - interval '1 minute'
      ) >= 5 then
        request_state := 'rate_limited';
      elsif not retry_failed_question and existing_question_count >= 30 then
        request_state := 'question_limit';
      end if;

      if request_state = 'accepted' and retry_failed_question then
        select
          failure.id,
          question.id
        into
          retried_failure_message_id,
          retried_question_message_id
        from public.messages as failure
        cross join lateral (
          select visitor.id, visitor.content
          from public.messages as visitor
          where visitor.conversation_id = failure.conversation_id
            and visitor.organization_id = failure.organization_id
            and visitor.message_type = 'visitor_question'
            and visitor.created_at < failure.created_at
          order by visitor.created_at desc, visitor.id desc
          limit 1
        ) as question
        where failure.conversation_id = selected_conversation.id
          and failure.organization_id = selected_conversation.organization_id
          and failure.message_type = 'technical_failure'
          and failure.status = 'failed'
          and question.content = visitor_question
        order by failure.created_at desc, failure.id desc
        limit 1;

        if retried_failure_message_id is null then
          request_state := 'retry_not_available';
        end if;
      end if;
    end if;
  end if;

  if request_state = 'accepted' and request_uses_ai then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'grounded-desk-global-daily-ai-request-budget',
        0
      )
    );

    if (
      select count(*)
      from public.messages as message
      where message.message_type in (
        'visitor_question',
        'answer_retry'
      )
        and message.consumes_ai_budget
        and message.created_at >= (
          pg_catalog.date_trunc(
            'day',
            pg_catalog.now() at time zone 'UTC'
          ) at time zone 'UTC'
        )
    ) >= daily_message_budget then
      request_state := 'daily_budget';
    end if;
  end if;

  if request_state = 'accepted' and selected_conversation.id is null then
    insert into public.conversations (
      organization_id,
      assistant_id
    ) values (
      published_assistant.organization_id,
      published_assistant.id
    )
    returning * into selected_conversation;
  end if;

  if request_state = 'accepted' and context_message_limit > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'role',
          case
            when recent.message_type = 'visitor_question' then 'visitor'
            else 'assistant'
          end,
          'content',
          recent.content,
          'resultType',
          case
            when recent.message_type = 'visitor_question' then null
            else recent.message_type
          end
        )
        order by
          recent.created_at,
          case
            when recent.message_type = 'visitor_question' then 1
            else 2
          end,
          recent.id
      ),
      '[]'::jsonb
    )
    into recent_context
    from (
      select
        message.id,
        message.message_type,
        message.content,
        message.created_at
      from public.messages as message
      where message.conversation_id = selected_conversation.id
        and message.organization_id = selected_conversation.organization_id
        and message.status = 'completed'
        and message.id is distinct from retried_question_message_id
        and message.message_type in (
          'visitor_question',
          'grounded_answer',
          'grounded_refusal',
          'conversational_response',
          'clarification_request'
        )
      order by
        message.created_at desc,
        case
          when message.message_type = 'visitor_question' then 1
          else 2
        end desc,
        message.id desc
      limit context_message_limit
    ) as recent;
  end if;

  if request_state = 'accepted' and retry_failed_question then
    insert into public.messages (
      organization_id,
      conversation_id,
      message_type,
      content,
      status,
      consumes_ai_budget,
      created_at
    ) values (
      published_assistant.organization_id,
      selected_conversation.id,
      'answer_retry',
      visitor_question,
      'completed',
      request_uses_ai,
      clock_timestamp()
    );

    update public.messages as message
    set
      message_type = 'grounded_answer',
      content = '',
      status = 'pending',
      created_at = clock_timestamp()
    where message.id = retried_failure_message_id
      and message.conversation_id = selected_conversation.id
      and message.organization_id = selected_conversation.organization_id
    returning message.id into created_assistant_message_id;
  elsif request_state = 'accepted' then
    insert into public.messages (
      organization_id,
      conversation_id,
      message_type,
      content,
      status,
      consumes_ai_budget,
      created_at
    ) values (
      published_assistant.organization_id,
      selected_conversation.id,
      'visitor_question',
      visitor_question,
      'completed',
      request_uses_ai,
      clock_timestamp()
    );

    insert into public.messages (
      organization_id,
      conversation_id,
      message_type,
      content,
      status,
      created_at
    ) values (
      published_assistant.organization_id,
      selected_conversation.id,
      'grounded_answer',
      '',
      'pending',
      clock_timestamp()
    )
    returning id into created_assistant_message_id;

    existing_question_count := existing_question_count + 1;
  end if;

  if request_state = 'accepted' then
    update public.conversations as conversation
    set last_activity_at = now()
    where conversation.id = selected_conversation.id
      and conversation.organization_id =
        selected_conversation.organization_id;
  end if;

  return query
  select
    request_state,
    selected_conversation.id,
    created_assistant_message_id,
    published_assistant.organization_id,
    published_assistant.id,
    published_assistant.name,
    published_assistant.service_scope,
    published_assistant.tone,
    published_assistant.human_contact_label,
    published_assistant.human_contact_url,
    recent_context,
    existing_question_count;
end;
$$;

revoke all
on function public.begin_public_conversation(
  uuid,
  text,
  uuid,
  boolean,
  integer,
  integer,
  boolean
)
from public;

grant execute
on function public.begin_public_conversation(
  uuid,
  text,
  uuid,
  boolean,
  integer,
  integer,
  boolean
)
to service_role;

create or replace function public.complete_public_conversation(
  assistant_public_id uuid,
  target_conversation_id uuid,
  result_type text,
  result_content text,
  result_citations jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conversation_organization_id uuid;
  completed_message_id uuid;
begin
  result_content := btrim(result_content);

  if result_type not in (
    'grounded_answer',
    'grounded_refusal',
    'conversational_response',
    'clarification_request'
  ) then
    raise exception 'public conversation result type is invalid'
      using errcode = '22023';
  end if;

  if
    result_content is null
    or char_length(result_content) not between 1 and 20000
  then
    raise exception 'public conversation result content is invalid'
      using errcode = '22023';
  end if;

  if
    result_citations is null
    or jsonb_typeof(result_citations) <> 'array'
  then
    raise exception 'public conversation citations are invalid'
      using errcode = '22023';
  end if;

  if
    result_type <> 'grounded_answer'
    and jsonb_array_length(result_citations) > 0
  then
    raise exception 'only grounded answers may include citations'
      using errcode = '22023';
  end if;

  select conversation.organization_id
  into conversation_organization_id
  from public.conversations as conversation
  join public.assistants as assistant
    on assistant.id = conversation.assistant_id
    and assistant.organization_id = conversation.organization_id
  where conversation.id = target_conversation_id
    and assistant.public_id = assistant_public_id;

  if conversation_organization_id is null then
    raise exception 'public conversation not found' using errcode = 'P0002';
  end if;

  update public.messages
  set
    message_type = result_type,
    content = result_content,
    status = 'completed'
  where conversation_id = target_conversation_id
    and organization_id = conversation_organization_id
    and message_type = 'grounded_answer'
    and status = 'pending'
  returning id into completed_message_id;

  if completed_message_id is null then
    raise exception 'pending assistant message not found'
      using errcode = 'P0002';
  end if;

  if result_type = 'grounded_answer' then
    insert into public.citations (
      organization_id,
      conversation_id,
      message_id,
      knowledge_source_id,
      source_title,
      source_url
    )
    select
      conversation_organization_id,
      target_conversation_id,
      completed_message_id,
      source.id,
      source.title,
      source.original_url
    from jsonb_array_elements(result_citations) with ordinality as citation(
      value,
      position
    )
    join public.knowledge_sources as source
      on source.id =
        nullif(citation.value ->> 'knowledgeSourceId', '')::uuid
      and source.organization_id = conversation_organization_id
    order by citation.position
    limit 3;
  end if;

  return completed_message_id;
end;
$$;

create function private.enforce_citation_grounded_answer()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages as message
    where message.id = new.message_id
      and message.organization_id = new.organization_id
      and message.conversation_id = new.conversation_id
      and message.message_type = 'grounded_answer'
      and message.status = 'completed'
  ) then
    raise exception 'citations require a completed grounded answer'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_citation_grounded_answer()
from public;

create trigger enforce_citation_grounded_answer
before insert or update of
  organization_id,
  conversation_id,
  message_id
on public.citations
for each row
execute function private.enforce_citation_grounded_answer();

create function private.enforce_quality_feedback_result()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages as message
    where message.id = new.answer_message_id
      and message.organization_id = new.organization_id
      and message.conversation_id = new.conversation_id
      and message.message_type in (
        'grounded_answer',
        'grounded_refusal'
      )
      and message.status = 'completed'
  ) then
    raise exception
      'quality feedback requires a completed grounded answer or refusal'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_quality_feedback_result()
from public;

create trigger enforce_quality_feedback_result
before insert or update of
  organization_id,
  conversation_id,
  answer_message_id
on public.quality_feedback
for each row
execute function private.enforce_quality_feedback_result();

create function private.enforce_message_result_dependents()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if
    (
      new.message_type <> 'grounded_answer'
      or new.status <> 'completed'
    )
    and exists (
      select 1
      from public.citations as citation
      where citation.message_id = new.id
        and citation.organization_id = new.organization_id
    )
  then
    raise exception 'only completed grounded answers may retain citations'
      using errcode = '23514';
  end if;

  if
    (
      new.message_type not in (
        'grounded_answer',
        'grounded_refusal'
      )
      or new.status <> 'completed'
    )
    and exists (
      select 1
      from public.quality_feedback as feedback
      where feedback.answer_message_id = new.id
        and feedback.organization_id = new.organization_id
    )
  then
    raise exception
      'only completed grounded answers or refusals may retain quality feedback'
      using errcode = '23514';
  end if;

  if
    new.message_type not in (
      'grounded_answer',
      'grounded_refusal'
    )
    and exists (
      select 1
      from public.unresolved_questions as unresolved
      where unresolved.answer_message_id = new.id
        and unresolved.organization_id = new.organization_id
    )
  then
    raise exception
      'only grounded answers or refusals may retain unresolved questions'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_message_result_dependents()
from public;

create trigger enforce_message_result_dependents
before update of message_type, status
on public.messages
for each row
execute function private.enforce_message_result_dependents();

create or replace function public.list_recent_conversations()
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
        'conversational_response',
        'clarification_request',
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
