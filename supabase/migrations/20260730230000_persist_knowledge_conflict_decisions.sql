create function public.complete_public_conflict_decision(
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
  section_citation jsonb;
  factual_request jsonb;
  coverage_decision jsonb;
  evidence_relationship jsonb;
  v_completed_message_id uuid;
  v_organization_id uuid;
  v_visitor_message_id uuid;
  v_factual_request_id uuid;
  v_evidence_count integer;
  v_position integer := 0;
begin
  select conversation.organization_id
  into v_organization_id
  from public.conversations as conversation
  join public.assistants as assistant
    on assistant.id = conversation.assistant_id
    and assistant.organization_id = conversation.organization_id
  where conversation.id = target_conversation_id
    and assistant.public_id = assistant_public_id;

  if v_organization_id is null then
    raise exception 'public conversation not found'
      using errcode = 'P0002';
  end if;

  if
    result_type <> 'knowledge_conflict'
    or response_decision is null
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
    raise exception 'conflict response decision structure is invalid'
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
    raise exception 'conflict factual request is invalid'
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
    or coverage_decision ->> 'status' <> 'conflicting'
    or jsonb_typeof(coverage_decision -> 'evidence') <> 'array'
    or jsonb_array_length(coverage_decision -> 'evidence')
      not between 2 and 10
  then
    raise exception 'conflict coverage decision is invalid'
      using errcode = '22023';
  end if;

  v_factual_request_id := (factual_request ->> 'id')::uuid;
  if
    v_factual_request_id
      <> (coverage_decision ->> 'factualRequestId')::uuid
    or result_sections is null
    or jsonb_typeof(result_sections) <> 'array'
    or jsonb_array_length(result_sections) <> 1
  then
    raise exception 'conflict response identity is invalid'
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
      'citations'
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
    or response_section ->> 'status' <> 'conflicting'
    or jsonb_typeof(response_section -> 'content') <> 'string'
    or char_length(btrim(response_section ->> 'content'))
      not between 1 and 20000
    or jsonb_typeof(response_section -> 'citations') <> 'array'
    or jsonb_array_length(response_section -> 'citations')
      <> jsonb_array_length(coverage_decision -> 'evidence')
  then
    raise exception 'conflict response section is invalid'
      using errcode = '22023';
  end if;

  select count(distinct relationship ->> 'contentUnitId')
  into v_evidence_count
  from jsonb_array_elements(
    coverage_decision -> 'evidence'
  ) as relationship;

  if v_evidence_count < 2 then
    raise exception 'conflict requires distinct evidence'
      using errcode = '22023';
  end if;

  for evidence_relationship in
    select value
    from jsonb_array_elements(
      coverage_decision -> 'evidence'
    )
  loop
    section_citation :=
      response_section -> 'citations' -> v_position;

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
      or jsonb_typeof(evidence_relationship -> 'sourceUrl')
        not in ('string', 'null')
      or evidence_relationship ->> 'relationship' <> 'conflicts'
      or jsonb_typeof(evidence_relationship -> 'exactExcerpt')
        <> 'string'
      or char_length(btrim(evidence_relationship ->> 'exactExcerpt'))
        not between 1 and 2000
      or jsonb_typeof(evidence_relationship -> 'reason') <> 'string'
      or char_length(btrim(evidence_relationship ->> 'reason'))
        not between 1 and 1000
      or jsonb_typeof(section_citation) <> 'object'
      or section_citation - array[
        'knowledgeSourceId',
        'contentUnitId',
        'title',
        'url',
        'exactExcerpt'
      ] <> '{}'::jsonb
      or not section_citation ?& array[
        'knowledgeSourceId',
        'contentUnitId',
        'title',
        'url',
        'exactExcerpt'
      ]
      or section_citation ->> 'knowledgeSourceId'
        <> evidence_relationship ->> 'knowledgeSourceId'
      or section_citation ->> 'contentUnitId'
        <> evidence_relationship ->> 'contentUnitId'
      or section_citation ->> 'title'
        <> evidence_relationship ->> 'sourceTitle'
      or (section_citation -> 'url')
        is distinct from (evidence_relationship -> 'sourceUrl')
      or section_citation ->> 'exactExcerpt'
        <> evidence_relationship ->> 'exactExcerpt'
    then
      raise exception 'conflict evidence or citation is invalid'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.content_units as content_unit
      join public.knowledge_sources as knowledge_source
        on knowledge_source.id = content_unit.knowledge_source_id
        and knowledge_source.organization_id =
          content_unit.organization_id
        and knowledge_source.current_revision_id =
          content_unit.knowledge_revision_id
        and knowledge_source.status = 'available'
        and knowledge_source.enabled
      where content_unit.id =
          (evidence_relationship ->> 'contentUnitId')::uuid
        and content_unit.organization_id = v_organization_id
        and content_unit.knowledge_source_id =
          (evidence_relationship ->> 'knowledgeSourceId')::uuid
        and knowledge_source.title =
          evidence_relationship ->> 'sourceTitle'
        and coalesce(
          to_jsonb(knowledge_source.original_url),
          'null'::jsonb
        )
          is not distinct from
          (evidence_relationship -> 'sourceUrl')
        and position(
          pg_catalog.regexp_replace(
            evidence_relationship ->> 'exactExcerpt',
            '\s+',
            ' ',
            'g'
          )
          in pg_catalog.regexp_replace(
            content_unit.content,
            '\s+',
            ' ',
            'g'
          )
        ) > 0
    ) then
      raise exception
        'evidence content unit must be an organization candidate'
        using errcode = '23514';
    end if;

    v_position := v_position + 1;
  end loop;

  select pending.id
  into v_completed_message_id
  from public.messages as pending
  where pending.conversation_id = target_conversation_id
    and pending.organization_id = v_organization_id
    and pending.message_type = 'grounded_answer'
    and pending.status = 'pending'
  for update;

  if v_completed_message_id is null then
    raise exception 'pending assistant message not found'
      using errcode = 'P0002';
  end if;

  select visitor.id
  into v_visitor_message_id
  from public.messages as visitor
  where visitor.organization_id = v_organization_id
    and visitor.conversation_id = target_conversation_id
    and visitor.message_type = 'visitor_question'
    and visitor.status = 'completed'
    and visitor.created_at <= (
      select created_at
      from public.messages
      where id = v_completed_message_id
    )
  order by visitor.created_at desc, visitor.id desc
  limit 1;

  if v_visitor_message_id is null then
    raise exception 'completed response exchange is invalid'
      using errcode = '23514';
  end if;

  update public.messages
  set
    message_type = 'knowledge_conflict',
    content = btrim(response_section ->> 'content'),
    status = 'completed'
  where id = v_completed_message_id;

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
    'conflicting',
    '[]'::jsonb,
    0,
    factual_request ->> 'requestAnalysisVersion',
    'knowledge-conflict-v1'
  );

  for evidence_relationship in
    select value
    from jsonb_array_elements(
      coverage_decision -> 'evidence'
    )
  loop
    insert into public.citations (
      organization_id,
      conversation_id,
      message_id,
      knowledge_source_id,
      source_title,
      source_url,
      factual_request_id
    ) values (
      v_organization_id,
      target_conversation_id,
      v_completed_message_id,
      (evidence_relationship ->> 'knowledgeSourceId')::uuid,
      evidence_relationship ->> 'sourceTitle',
      evidence_relationship ->> 'sourceUrl',
      v_factual_request_id
    );

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
      'conflicts',
      evidence_relationship ->> 'exactExcerpt',
      evidence_relationship ->> 'reason',
      coverage_decision ->> 'version'
    );
  end loop;

  insert into public.unresolved_questions (
    organization_id,
    conversation_id,
    question_message_id,
    answer_message_id,
    factual_request_id,
    question,
    answer_content,
    citations,
    trigger_type,
    status
  ) values (
    v_organization_id,
    target_conversation_id,
    v_visitor_message_id,
    v_completed_message_id,
    v_factual_request_id,
    factual_request ->> 'originalText',
    response_section ->> 'content',
    response_section -> 'citations',
    'knowledge_conflict',
    'pending'
  );

  return v_completed_message_id;
end;
$$;

revoke all
on function public.complete_public_conflict_decision(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb
)
from public;

grant execute
on function public.complete_public_conflict_decision(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb
)
to service_role;
