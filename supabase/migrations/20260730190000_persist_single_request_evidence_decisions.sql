alter table public.ai_call_logs
drop constraint ai_call_logs_call_type_check;

alter table public.ai_call_logs
add constraint ai_call_logs_call_type_check
check (
  call_type in (
    'request_analysis',
    'evidence_coverage',
    'embedding',
    'rerank',
    'answer'
  )
);

create function public.complete_public_single_request_decision(
  assistant_public_id uuid,
  target_conversation_id uuid,
  result_type text,
  result_sections jsonb,
  response_decision jsonb
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
  coverage_decision jsonb;
  evidence_relationship jsonb;
  v_completed_message_id uuid;
  v_organization_id uuid;
  v_visitor_message_id uuid;
  v_factual_request_id uuid;
  v_coverage_status text;
begin
  if
    response_decision is null
    or jsonb_typeof(response_decision) <> 'object'
    or response_decision - array[
      'factualRequest',
      'coverage'
    ] <> '{}'::jsonb
    or not response_decision ?& array[
      'factualRequest',
      'coverage'
    ]
  then
    raise exception 'response decision structure is invalid'
      using errcode = '22023';
  end if;

  factual_request := response_decision -> 'factualRequest';
  coverage_decision := response_decision -> 'coverage';

  if
    jsonb_typeof(factual_request) <> 'object'
    or factual_request - array[
      'id',
      'originalText',
      'normalizedQuestion',
      'requestAnalysisVersion'
    ] <> '{}'::jsonb
    or not factual_request ?& array[
      'id',
      'originalText',
      'normalizedQuestion',
      'requestAnalysisVersion'
    ]
    or jsonb_typeof(factual_request -> 'id') <> 'string'
    or jsonb_typeof(factual_request -> 'originalText') <> 'string'
    or char_length(btrim(factual_request ->> 'originalText'))
      not between 1 and 2000
    or jsonb_typeof(factual_request -> 'normalizedQuestion') <> 'string'
    or char_length(btrim(factual_request ->> 'normalizedQuestion'))
      not between 1 and 2000
    or jsonb_typeof(factual_request -> 'requestAnalysisVersion')
      <> 'string'
    or char_length(btrim(factual_request ->> 'requestAnalysisVersion'))
      not between 1 and 120
  then
    raise exception 'factual request decision is invalid'
      using errcode = '22023';
  end if;

  if
    jsonb_typeof(coverage_decision) <> 'object'
    or coverage_decision - array[
      'version',
      'factualRequestId',
      'status',
      'evidence'
    ] <> '{}'::jsonb
    or not coverage_decision ?& array[
      'version',
      'factualRequestId',
      'status',
      'evidence'
    ]
    or jsonb_typeof(coverage_decision -> 'version') <> 'string'
    or char_length(btrim(coverage_decision ->> 'version'))
      not between 1 and 120
    or jsonb_typeof(coverage_decision -> 'factualRequestId') <> 'string'
    or jsonb_typeof(coverage_decision -> 'status') <> 'string'
    or coverage_decision ->> 'status'
      not in ('supported', 'unsupported', 'conflicting')
    or jsonb_typeof(coverage_decision -> 'evidence') <> 'array'
    or jsonb_array_length(coverage_decision -> 'evidence') > 10
  then
    raise exception 'coverage decision is invalid'
      using errcode = '22023';
  end if;

  v_factual_request_id := (factual_request ->> 'id')::uuid;
  v_coverage_status := coverage_decision ->> 'status';
  response_section := result_sections -> 0;

  if
    v_factual_request_id
      <> (coverage_decision ->> 'factualRequestId')::uuid
    or result_sections is null
    or jsonb_typeof(result_sections) <> 'array'
    or jsonb_array_length(result_sections) <> 1
    or jsonb_typeof(response_section) <> 'object'
    or v_factual_request_id <> (response_section ->> 'id')::uuid
    or (
      result_type = 'grounded_answer'
      and v_coverage_status <> 'supported'
    )
    or (
      result_type = 'grounded_refusal'
      and v_coverage_status <> 'unsupported'
    )
    or result_type not in ('grounded_answer', 'grounded_refusal')
    or (
      v_coverage_status = 'supported'
      and jsonb_array_length(coverage_decision -> 'evidence') = 0
    )
    or (
      v_coverage_status = 'unsupported'
      and jsonb_array_length(coverage_decision -> 'evidence') <> 0
    )
  then
    raise exception 'response decision does not match the section result'
      using errcode = '22023';
  end if;

  for evidence_relationship in
    select value
    from jsonb_array_elements(
      coverage_decision -> 'evidence'
    )
  loop
    if
      jsonb_typeof(evidence_relationship) <> 'object'
      or evidence_relationship - array[
        'contentUnitId',
        'knowledgeSourceId',
        'sourceTitle',
        'sourceUrl',
        'relationship',
        'exactExcerpt',
        'reason'
      ] <> '{}'::jsonb
      or not evidence_relationship ?& array[
        'contentUnitId',
        'knowledgeSourceId',
        'sourceTitle',
        'sourceUrl',
        'relationship',
        'exactExcerpt',
        'reason'
      ]
      or jsonb_typeof(evidence_relationship -> 'contentUnitId')
        <> 'string'
      or jsonb_typeof(evidence_relationship -> 'knowledgeSourceId')
        <> 'string'
      or jsonb_typeof(evidence_relationship -> 'sourceTitle')
        <> 'string'
      or (
        jsonb_typeof(evidence_relationship -> 'sourceUrl')
          not in ('string', 'null')
      )
      or evidence_relationship ->> 'relationship' <> 'supports'
      or jsonb_typeof(evidence_relationship -> 'exactExcerpt')
        <> 'string'
      or char_length(btrim(evidence_relationship ->> 'exactExcerpt'))
        not between 1 and 2000
      or jsonb_typeof(evidence_relationship -> 'reason') <> 'string'
      or char_length(btrim(evidence_relationship ->> 'reason'))
        not between 1 and 1000
    then
      raise exception 'evidence relationship is invalid'
        using errcode = '22023';
    end if;
  end loop;

  v_completed_message_id :=
    public.complete_public_conversation_sections(
      assistant_public_id,
      target_conversation_id,
      result_type,
      result_sections
    );

  select
    assistant_message.organization_id,
    visitor.id
  into
    v_organization_id,
    v_visitor_message_id
  from public.messages as assistant_message
  cross join lateral (
    select question.id
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
  where assistant_message.id = v_completed_message_id
    and assistant_message.conversation_id =
      target_conversation_id
    and assistant_message.status = 'completed';

  if
    v_organization_id is null
    or v_visitor_message_id is null
  then
    raise exception 'completed response exchange is invalid'
      using errcode = '23514';
  end if;

  if result_type = 'grounded_answer' then
    update public.message_factual_requests
    set
      original_text = factual_request ->> 'originalText',
      normalized_question =
        factual_request ->> 'normalizedQuestion',
      coverage_status = v_coverage_status,
      request_analysis_version =
        factual_request ->> 'requestAnalysisVersion',
      response_strategy_version = 'single-request-evidence-v1'
    where id = v_factual_request_id
      and organization_id = v_organization_id
      and conversation_id = target_conversation_id
      and visitor_message_id = v_visitor_message_id
      and assistant_message_id = v_completed_message_id;

    if not found then
      raise exception 'supported factual request was not persisted'
        using errcode = '23514';
    end if;
  else
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
      'complete',
      v_coverage_status,
      '[]'::jsonb,
      0,
      factual_request ->> 'requestAnalysisVersion',
      'single-request-evidence-v1'
    );

    update public.unresolved_questions
    set
      factual_request_id = v_factual_request_id,
      question = factual_request ->> 'originalText',
      trigger_type = 'unsupported_factual_request'
    where organization_id = v_organization_id
      and conversation_id = target_conversation_id
      and question_message_id = v_visitor_message_id
      and answer_message_id = v_completed_message_id
      and factual_request_id is null
      and trigger_type = 'grounded_refusal';

    if not found then
      raise exception 'refusal knowledge gap was not persisted'
        using errcode = '23514';
    end if;
  end if;

  for evidence_relationship in
    select value
    from jsonb_array_elements(
      coverage_decision -> 'evidence'
    )
  loop
    insert into public.evidence_snapshots (
      organization_id,
      conversation_id,
      factual_request_id,
      content_unit_id,
      knowledge_source_id,
      source_title,
      source_url,
      relationship,
      exact_excerpt,
      decision_reason,
      coverage_decision_version
    ) values (
      v_organization_id,
      target_conversation_id,
      v_factual_request_id,
      (evidence_relationship ->> 'contentUnitId')::uuid,
      (evidence_relationship ->> 'knowledgeSourceId')::uuid,
      evidence_relationship ->> 'sourceTitle',
      evidence_relationship ->> 'sourceUrl',
      evidence_relationship ->> 'relationship',
      evidence_relationship ->> 'exactExcerpt',
      evidence_relationship ->> 'reason',
      coverage_decision ->> 'version'
    );
  end loop;

  return v_completed_message_id;
end;
$$;

revoke all
on function public.complete_public_single_request_decision(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb
)
from public;

grant execute
on function public.complete_public_single_request_decision(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb
)
to service_role;
