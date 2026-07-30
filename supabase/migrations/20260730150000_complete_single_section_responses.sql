create function public.complete_public_conversation_sections(
  assistant_public_id uuid,
  target_conversation_id uuid,
  result_type text,
  result_sections jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  response_section jsonb;
  expected_section_status text;
  completed_message_id uuid;
  conversation_organization_id uuid;
  visitor_message_id uuid;
  visitor_question text;
begin
  if
    result_sections is null
    or jsonb_typeof(result_sections) <> 'array'
    or jsonb_array_length(result_sections) <> 1
  then
    raise exception 'exactly one response section is required'
      using errcode = '22023';
  end if;

  response_section := result_sections -> 0;

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
  then
    raise exception 'response section structure is invalid'
      using errcode = '22023';
  end if;

  if
    jsonb_typeof(response_section -> 'id') <> 'string'
    or jsonb_typeof(response_section -> 'order') <> 'number'
    or (response_section ->> 'order')::numeric <> 1
    or jsonb_typeof(response_section -> 'status') <> 'string'
    or jsonb_typeof(response_section -> 'content') <> 'string'
    or char_length(btrim(response_section ->> 'content'))
      not between 1 and 20000
    or jsonb_typeof(response_section -> 'citations') <> 'array'
  then
    raise exception 'response section values are invalid'
      using errcode = '22023';
  end if;

  expected_section_status := case result_type
    when 'grounded_answer' then 'supported'
    when 'grounded_refusal' then 'unsupported'
    when 'conversational_response' then 'conversational'
    when 'clarification_request' then 'clarification'
    else null
  end;

  if expected_section_status is null then
    raise exception 'public conversation result type is invalid'
      using errcode = '22023';
  end if;

  if response_section ->> 'status' <> expected_section_status then
    raise exception 'response section status does not match result type'
      using errcode = '22023';
  end if;

  if
    result_type <> 'grounded_answer'
    and jsonb_array_length(response_section -> 'citations') > 0
  then
    raise exception 'only grounded answers may include citations'
      using errcode = '22023';
  end if;

  if
    response_section ? 'contact'
    and (
      jsonb_typeof(response_section -> 'contact') <> 'object'
      or jsonb_typeof(response_section -> 'contact' -> 'label')
        <> 'string'
      or jsonb_typeof(response_section -> 'contact' -> 'url')
        <> 'string'
    )
  then
    raise exception 'response section contact is invalid'
      using errcode = '22023';
  end if;

  completed_message_id := public.complete_public_conversation(
    assistant_public_id,
    target_conversation_id,
    result_type,
    response_section ->> 'content',
    response_section -> 'citations'
  );

  if result_type = 'grounded_answer' then
    select
      assistant_message.organization_id,
      visitor.id,
      visitor.content
    into
      conversation_organization_id,
      visitor_message_id,
      visitor_question
    from public.messages as assistant_message
    cross join lateral (
      select question.id, question.content
      from public.messages as question
      where question.organization_id =
          assistant_message.organization_id
        and question.conversation_id =
          assistant_message.conversation_id
        and question.message_type = 'visitor_question'
        and question.status = 'completed'
        and question.created_at <= assistant_message.created_at
      order by question.created_at desc, question.id desc
      limit 1
    ) as visitor
    where assistant_message.id = completed_message_id
      and assistant_message.conversation_id =
        target_conversation_id
      and assistant_message.message_type = 'grounded_answer'
      and assistant_message.status = 'completed';

    if
      conversation_organization_id is null
      or visitor_message_id is null
    then
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
      (response_section ->> 'id')::uuid,
      conversation_organization_id,
      target_conversation_id,
      visitor_message_id,
      completed_message_id,
      1,
      visitor_question,
      visitor_question,
      'complete',
      'supported',
      '[]'::jsonb,
      0,
      'legacy-routing-v1',
      'single-section-v1'
    );

    update public.citations as citation
    set factual_request_id = (response_section ->> 'id')::uuid
    where citation.organization_id =
        conversation_organization_id
      and citation.conversation_id = target_conversation_id
      and citation.message_id = completed_message_id;
  end if;

  return completed_message_id;
end;
$$;

revoke all
on function public.complete_public_conversation_sections(
  uuid,
  uuid,
  text,
  jsonb
)
from public;

grant execute
on function public.complete_public_conversation_sections(
  uuid,
  uuid,
  text,
  jsonb
)
to service_role;
