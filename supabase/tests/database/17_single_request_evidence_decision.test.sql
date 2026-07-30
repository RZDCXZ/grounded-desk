begin;

select plan(9);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.publish_assistant();

insert into public.knowledge_sources (
  id,
  organization_id,
  title,
  source_type,
  status,
  original_url
) values (
  '00000000-0000-4000-8000-000000000794',
  '00000000-0000-4000-8000-000000000101',
  '证据覆盖来源',
  'manual',
  'available',
  'https://example.com/evidence-coverage'
);

insert into public.knowledge_revisions (
  id,
  organization_id,
  knowledge_source_id,
  title,
  body,
  original_url,
  status,
  completed_at
) values (
  '00000000-0000-4000-8000-000000000894',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000794',
  '证据覆盖来源',
  '标准服务在两个工作日内完成。',
  'https://example.com/evidence-coverage',
  'available',
  now()
);

update public.knowledge_sources
set current_revision_id =
  '00000000-0000-4000-8000-000000000894'
where id = '00000000-0000-4000-8000-000000000794';

insert into public.content_units (
  id,
  organization_id,
  knowledge_source_id,
  knowledge_revision_id,
  position,
  content,
  embedding
) values (
  '00000000-0000-4000-8000-000000000994',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000794',
  '00000000-0000-4000-8000-000000000894',
  0,
  '标准服务在两个工作日内完成。',
  array_fill(0::real, array[1024])::extensions.vector
);

create temporary table published_assistant as
select public_id from public.assistants;

reset role;
grant select on published_assistant to service_role;
grant select on public.message_factual_requests to service_role;
grant select on public.evidence_snapshots to service_role;
grant select on public.citations to service_role;
grant select on public.unresolved_questions to service_role;
grant select on public.messages to service_role;
grant insert on public.ai_call_logs to service_role;
set local role service_role;

create temporary table supported_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '标准服务多久完成？'
);

select lives_ok(
  $$
    select public.complete_public_single_request_decision(
      (select public_id from published_assistant),
      (select conversation_id from supported_request),
      'grounded_answer',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001797',
          'order', 1,
          'status', 'supported',
          'content', '标准服务在两个工作日内完成。',
          'citations', jsonb_build_array(
            jsonb_build_object(
              'knowledgeSourceId',
              '00000000-0000-4000-8000-000000000794'
            )
          )
        )
      ),
      jsonb_build_object(
        'factualRequest', jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001797',
          'originalText', '标准服务多久完成？',
          'normalizedQuestion', '标准服务需要多久完成？',
          'requestAnalysisVersion', 'request-analysis-v1'
        ),
        'coverage', jsonb_build_object(
          'version', 'evidence-coverage-v1',
          'factualRequestId',
            '00000000-0000-4000-8000-000000001797',
          'status', 'supported',
          'evidence', jsonb_build_array(
            jsonb_build_object(
              'contentUnitId',
                '00000000-0000-4000-8000-000000000994',
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000794',
              'sourceTitle', '证据覆盖来源',
              'sourceUrl', 'https://example.com/evidence-coverage',
              'relationship', 'supports',
              'exactExcerpt', '标准服务在两个工作日内完成。',
              'reason', '原文明确给出完成时间。'
            )
          )
        )
      )
    )
  $$,
  'supported decisions complete atomically'
);

select results_eq(
  $$
    select
      original_text,
      normalized_question,
      coverage_status,
      request_analysis_version,
      response_strategy_version
    from public.message_factual_requests
    where id = '00000000-0000-4000-8000-000000001797'
  $$,
  $$
    values (
      '标准服务多久完成？',
      '标准服务需要多久完成？',
      'supported',
      'request-analysis-v1',
      'single-request-evidence-v1'
    )
  $$,
  'the analyzed factual request and strategy versions are persisted'
);

select results_eq(
  $$
    select
      content_unit_id,
      knowledge_source_id,
      relationship,
      exact_excerpt,
      decision_reason,
      coverage_decision_version
    from public.evidence_snapshots
    where factual_request_id =
      '00000000-0000-4000-8000-000000001797'
  $$,
  $$
    values (
      '00000000-0000-4000-8000-000000000994'::uuid,
      '00000000-0000-4000-8000-000000000794'::uuid,
      'supports',
      '标准服务在两个工作日内完成。',
      '原文明确给出完成时间。',
      'evidence-coverage-v1'
    )
  $$,
  'validated evidence is snapshotted with its exact excerpt'
);

select is(
  (
    select factual_request_id
    from public.citations
    where message_id = (
      select assistant_message_id from supported_request
    )
  ),
  '00000000-0000-4000-8000-000000001797'::uuid,
  'server citations stay linked to the factual request'
);

create temporary table unsupported_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '是否提供周末上门服务？'
);

select public.complete_public_single_request_decision(
  (select public_id from published_assistant),
  (select conversation_id from unsupported_request),
  'grounded_refusal',
  jsonb_build_array(
    jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000001798',
      'order', 1,
      'status', 'unsupported',
      'content', '当前可用知识不足以支持这个问题的事实性回答。',
      'citations', '[]'::jsonb,
      'contact', jsonb_build_object(
        'label', '联系人工',
        'url', 'mailto:admin@groundeddesk.local'
      )
    )
  ),
  jsonb_build_object(
    'factualRequest', jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000001798',
      'originalText', '是否提供周末上门服务？',
      'normalizedQuestion', '是否提供周末上门服务？',
      'requestAnalysisVersion', 'request-analysis-v1'
    ),
    'coverage', jsonb_build_object(
      'version', 'evidence-coverage-v1',
      'factualRequestId',
        '00000000-0000-4000-8000-000000001798',
      'status', 'unsupported',
      'evidence', '[]'::jsonb
    )
  )
);

select is(
  (
    select coverage_status
    from public.message_factual_requests
    where id = '00000000-0000-4000-8000-000000001798'
  ),
  'unsupported',
  'an unsupported complete request is persisted'
);

select results_eq(
  $$
    select factual_request_id, trigger_type, question
    from public.unresolved_questions
    where answer_message_id = (
      select assistant_message_id from unsupported_request
    )
  $$,
  $$
    values (
      '00000000-0000-4000-8000-000000001798'::uuid,
      'unsupported_factual_request',
      '是否提供周末上门服务？'
    )
  $$,
  'reliable refusal creates a request-scoped knowledge gap'
);

create temporary table forged_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '伪造来源'
);

select throws_ok(
  $$
    select public.complete_public_single_request_decision(
      (select public_id from published_assistant),
      (select conversation_id from forged_request),
      'grounded_answer',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001799',
          'order', 1,
          'status', 'supported',
          'content', '伪造回答',
          'citations', jsonb_build_array(
            jsonb_build_object(
              'knowledgeSourceId',
              '00000000-0000-4000-8000-000000000794'
            )
          )
        )
      ),
      jsonb_build_object(
        'factualRequest', jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001799',
          'originalText', '伪造来源',
          'normalizedQuestion', '伪造来源',
          'requestAnalysisVersion', 'request-analysis-v1'
        ),
        'coverage', jsonb_build_object(
          'version', 'evidence-coverage-v1',
          'factualRequestId',
            '00000000-0000-4000-8000-000000001799',
          'status', 'supported',
          'evidence', jsonb_build_array(
            jsonb_build_object(
              'contentUnitId',
                '00000000-0000-4000-8000-000000000995',
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000794',
              'sourceTitle', '伪造来源',
              'sourceUrl', null,
              'relationship', 'supports',
              'exactExcerpt', '伪造',
              'reason', '伪造'
            )
          )
        )
      )
    )
  $$,
  '23514',
  'evidence content unit must be an organization candidate',
  'forged evidence identities reject the whole completion'
);

select is(
  (
    select status
    from public.messages
    where id = (select assistant_message_id from forged_request)
  ),
  'pending',
  'a rejected decision leaves no partially completed answer'
);

select lives_ok(
  $$
    insert into public.ai_call_logs (
      organization_id,
      call_type,
      provider,
      model,
      input_tokens,
      output_tokens,
      total_tokens,
      duration_ms,
      outcome,
      trace_id
    ) values (
      '00000000-0000-4000-8000-000000000101',
      'evidence_coverage',
      'deepseek',
      'coverage-test',
      10,
      3,
      13,
      5,
      'success',
      'coverage-log-trace'
    )
  $$,
  'evidence coverage calls are accepted by the safe metadata log'
);

select * from finish();

rollback;
