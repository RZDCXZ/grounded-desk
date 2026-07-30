create function public.complete_public_clarification_decision(
  assistant_public_id uuid,
  target_conversation_id uuid,
  result_type text,
  result_sections jsonb,
  clarification_decision jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  response_section jsonb;
  factual_request jsonb;
  missing_item jsonb;
  v_completed_message_id uuid;
  v_organization_id uuid;
  v_human_contact_label text;
  v_human_contact_url text;
  v_visitor_message_id uuid;
  v_factual_request_id uuid;
  v_outcome text;
  v_clarification_round smallint;
begin
  if
    clarification_decision is null
    or jsonb_typeof(clarification_decision) <> 'object'
    or clarification_decision - array[
      'factualRequest',
      'outcome',
      'responseStrategyVersion'
    ] <> '{}'::jsonb
    or not clarification_decision ?& array[
      'factualRequest',
      'outcome',
      'responseStrategyVersion'
    ]
    or clarification_decision ->> 'responseStrategyVersion'
      <> 'clarification-handoff-v1'
  then
    raise exception 'clarification decision structure is invalid'
      using errcode = '22023';
  end if;

  factual_request := clarification_decision -> 'factualRequest';
  v_outcome := clarification_decision ->> 'outcome';

  if
    jsonb_typeof(factual_request) <> 'object'
    or factual_request - array[
      'id',
      'originalText',
      'normalizedQuestion',
      'missingInformation',
      'clarificationRound',
      'requestAnalysisVersion'
    ] <> '{}'::jsonb
    or not factual_request ?& array[
      'id',
      'originalText',
      'normalizedQuestion',
      'missingInformation',
      'clarificationRound',
      'requestAnalysisVersion'
    ]
    or jsonb_typeof(factual_request -> 'id') <> 'string'
    or jsonb_typeof(factual_request -> 'originalText') <> 'string'
    or char_length(btrim(factual_request ->> 'originalText'))
      not between 1 and 2000
    or jsonb_typeof(factual_request -> 'normalizedQuestion') <> 'string'
    or char_length(btrim(factual_request ->> 'normalizedQuestion'))
      not between 1 and 2000
    or jsonb_typeof(factual_request -> 'missingInformation') <> 'array'
    or jsonb_array_length(factual_request -> 'missingInformation')
      not between 1 and 10
    or jsonb_typeof(factual_request -> 'clarificationRound') <> 'number'
    or (factual_request ->> 'clarificationRound')::numeric
      not in (1, 2)
    or jsonb_typeof(factual_request -> 'requestAnalysisVersion')
      <> 'string'
    or char_length(btrim(factual_request ->> 'requestAnalysisVersion'))
      not between 1 and 120
    or v_outcome not in ('clarification_request', 'human_handoff')
    or result_type <> v_outcome
  then
    raise exception 'clarification factual request is invalid'
      using errcode = '22023';
  end if;

  for missing_item in
    select value
    from jsonb_array_elements(
      factual_request -> 'missingInformation'
    )
  loop
    if
      jsonb_typeof(missing_item) <> 'string'
      or char_length(btrim(missing_item #>> '{}')) not between 1 and 300
    then
      raise exception 'missing information item is invalid'
        using errcode = '22023';
    end if;
  end loop;

  if
    result_sections is null
    or jsonb_typeof(result_sections) <> 'array'
    or jsonb_array_length(result_sections) <> 1
  then
    raise exception 'exactly one response section is required'
      using errcode = '22023';
  end if;

  response_section := result_sections -> 0;
  v_factual_request_id := (factual_request ->> 'id')::uuid;
  v_clarification_round :=
    (factual_request ->> 'clarificationRound')::smallint;

  if
    jsonb_typeof(response_section) <> 'object'
    or response_section - array[
      'id',
      'order',
      'status',
      'content',
      'citations',
      'contact'
    ] <> '{}'::jsonb
    or not response_section ?& array[
      'id',
      'order',
      'status',
      'content',
      'citations'
    ]
    or jsonb_typeof(response_section -> 'id') <> 'string'
    or (response_section ->> 'id')::uuid <> v_factual_request_id
    or jsonb_typeof(response_section -> 'order') <> 'number'
    or (response_section ->> 'order')::numeric <> 1
    or jsonb_typeof(response_section -> 'status') <> 'string'
    or response_section ->> 'status' <> (
      case result_type
        when 'clarification_request' then 'clarification'
        when 'human_handoff' then 'handoff'
        else null
      end
    )
    or jsonb_typeof(response_section -> 'content') <> 'string'
    or char_length(btrim(response_section ->> 'content'))
      not between 1 and 20000
    or jsonb_typeof(response_section -> 'citations') <> 'array'
    or jsonb_array_length(response_section -> 'citations') <> 0
    or (
      result_type = 'clarification_request'
      and response_section ? 'contact'
    )
    or (
      result_type = 'human_handoff'
      and (
        v_clarification_round <> 2
        or not response_section ? 'contact'
        or jsonb_typeof(response_section -> 'contact') <> 'object'
        or (response_section -> 'contact') - array['label', 'url']
          <> '{}'::jsonb
        or not (response_section -> 'contact') ?& array['label', 'url']
        or jsonb_typeof(response_section -> 'contact' -> 'label')
          <> 'string'
        or char_length(
          btrim(response_section -> 'contact' ->> 'label')
        ) not between 1 and 120
        or jsonb_typeof(response_section -> 'contact' -> 'url')
          <> 'string'
        or char_length(
          btrim(response_section -> 'contact' ->> 'url')
        ) not between 1 and 2000
      )
    )
  then
    raise exception 'clarification section does not match the decision'
      using errcode = '22023';
  end if;

  select
    conversation.organization_id,
    assistant.human_contact_label,
    assistant.human_contact_url
  into
    v_organization_id,
    v_human_contact_label,
    v_human_contact_url
  from public.conversations as conversation
  join public.assistants as assistant
    on assistant.id = conversation.assistant_id
    and assistant.organization_id = conversation.organization_id
  where conversation.id = target_conversation_id
    and assistant.public_id = assistant_public_id;

  if v_organization_id is null then
    raise exception 'public conversation not found' using errcode = 'P0002';
  end if;

  if
    result_type = 'human_handoff'
    and (
      response_section -> 'contact' ->> 'label'
        <> v_human_contact_label
      or response_section -> 'contact' ->> 'url'
        <> v_human_contact_url
    )
  then
    raise exception 'human handoff contact does not match assistant'
      using errcode = '22023';
  end if;

  if
    v_clarification_round = 2
    and not exists (
      select 1
      from public.message_factual_requests as previous_request
      join public.messages as previous_result
        on previous_result.id = previous_request.assistant_message_id
        and previous_result.organization_id =
          previous_request.organization_id
      where previous_request.organization_id = v_organization_id
        and previous_request.conversation_id = target_conversation_id
        and previous_request.original_text =
          factual_request ->> 'originalText'
        and previous_request.completeness = 'incomplete'
        and previous_request.clarification_round = 1
        and previous_result.message_type = 'clarification_request'
        and previous_result.status = 'completed'
    )
  then
    raise exception 'clarification round two requires round one'
      using errcode = '22023';
  end if;

  if
    result_type = 'human_handoff'
    and not exists (
      select 1
      from public.message_factual_requests as previous_request
      join public.messages as previous_result
        on previous_result.id = previous_request.assistant_message_id
        and previous_result.organization_id =
          previous_request.organization_id
      where previous_request.organization_id = v_organization_id
        and previous_request.conversation_id = target_conversation_id
        and previous_request.original_text =
          factual_request ->> 'originalText'
        and previous_request.completeness = 'incomplete'
        and previous_request.clarification_round = 2
        and previous_result.message_type = 'clarification_request'
        and previous_result.status = 'completed'
    )
  then
    raise exception 'human handoff requires two clarification rounds'
      using errcode = '22023';
  end if;

  if result_type = 'clarification_request' then
    v_completed_message_id :=
      public.complete_public_conversation_sections(
        assistant_public_id,
        target_conversation_id,
        result_type,
        result_sections
      );
  else
    update public.messages as message
    set
      message_type = 'human_handoff',
      content = btrim(response_section ->> 'content'),
      status = 'completed'
    where message.conversation_id = target_conversation_id
      and message.organization_id = v_organization_id
      and message.message_type = 'grounded_answer'
      and message.status = 'pending'
    returning message.id into v_completed_message_id;

    if v_completed_message_id is null then
      raise exception 'pending assistant message not found'
        using errcode = 'P0002';
    end if;
  end if;

  select visitor.id
  into v_visitor_message_id
  from public.messages as visitor
  where visitor.organization_id = v_organization_id
    and visitor.conversation_id = target_conversation_id
    and visitor.message_type = 'visitor_question'
    and visitor.status = 'completed'
    and visitor.created_at <= (
      select completed.created_at
      from public.messages as completed
      where completed.id = v_completed_message_id
    )
  order by visitor.created_at desc, visitor.id desc
  limit 1;

  if v_visitor_message_id is null then
    raise exception 'completed response exchange is invalid'
      using errcode = '23514';
  end if;

  insert into public.message_factual_requests (
    id,
    organization_id,
    conversation_id,
    visitor_message_id,
    assistant_message_id,
    request_order,
    original_text,
    normalized_question,
    completeness,
    coverage_status,
    missing_information,
    clarification_round,
    request_analysis_version,
    response_strategy_version
  ) values (
    v_factual_request_id,
    v_organization_id,
    target_conversation_id,
    v_visitor_message_id,
    v_completed_message_id,
    1,
    factual_request ->> 'originalText',
    factual_request ->> 'normalizedQuestion',
    'incomplete',
    null,
    factual_request -> 'missingInformation',
    v_clarification_round,
    factual_request ->> 'requestAnalysisVersion',
    clarification_decision ->> 'responseStrategyVersion'
  );

  return v_completed_message_id;
end;
$$;

revoke all
on function public.complete_public_clarification_decision(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb
)
from public;

grant execute
on function public.complete_public_clarification_decision(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb
)
to service_role;

create function public.get_public_latest_clarification_state(
  assistant_public_id uuid,
  target_conversation_id uuid
)
returns table (
  original_text text,
  clarification_round smallint,
  clarification_content text
)
language sql
stable
security definer
set search_path = ''
as $$
  with target_conversation as (
    select
      conversation.id,
      conversation.organization_id
    from public.conversations as conversation
    join public.assistants as assistant
      on assistant.id = conversation.assistant_id
      and assistant.organization_id = conversation.organization_id
    where conversation.id = target_conversation_id
      and assistant.public_id = assistant_public_id
  ),
  latest_result as (
    select result.id, result.message_type, result.content
    from public.messages as result
    join target_conversation as target
      on target.id = result.conversation_id
      and target.organization_id = result.organization_id
    where result.message_type not in (
        'visitor_question',
        'answer_retry'
      )
      and result.status = 'completed'
    order by result.created_at desc, result.id desc
    limit 1
  )
  select
    factual_request.original_text,
    factual_request.clarification_round,
    latest_result.content
  from latest_result
  join public.message_factual_requests as factual_request
    on factual_request.assistant_message_id = latest_result.id
  where latest_result.message_type = 'clarification_request'
    and factual_request.completeness = 'incomplete'
    and factual_request.clarification_round in (1, 2);
$$;

revoke all
on function public.get_public_latest_clarification_state(uuid, uuid)
from public;

grant execute
on function public.get_public_latest_clarification_state(uuid, uuid)
to service_role;

create function public.begin_public_conversation_with_clarification_state(
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
  question_count integer,
  clarification_original_text text,
  clarification_round smallint,
  clarification_content text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select
    begun.request_status,
    begun.conversation_id,
    begun.assistant_message_id,
    begun.organization_id,
    begun.assistant_id,
    begun.name,
    begun.service_scope,
    begun.tone,
    begun.human_contact_label,
    begun.human_contact_url,
    begun.context_messages,
    begun.question_count,
    clarification.original_text,
    clarification.clarification_round,
    clarification.clarification_content
  from public.begin_public_conversation(
    assistant_public_id,
    visitor_question,
    requested_conversation_id,
    retry_failed_question,
    daily_message_budget,
    context_message_limit,
    request_uses_ai
  ) as begun
  left join lateral public.get_public_latest_clarification_state(
    assistant_public_id,
    begun.conversation_id
  ) as clarification
    on begun.request_status = 'accepted';
$$;

revoke all
on function public.begin_public_conversation_with_clarification_state(
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
on function public.begin_public_conversation_with_clarification_state(
  uuid,
  text,
  uuid,
  boolean,
  integer,
  integer,
  boolean
)
to service_role;

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
        'partially_grounded_answer',
        'knowledge_conflict',
        'grounded_refusal',
        'conversational_response',
        'clarification_request',
        'human_handoff',
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
