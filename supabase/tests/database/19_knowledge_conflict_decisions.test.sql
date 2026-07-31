begin;

select plan(13);

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
) values
(
  '00000000-0000-4000-8000-000000000795',
  '00000000-0000-4000-8000-000000000101',
  '退款时效说明',
  'manual',
  'available',
  'https://example.com/refund-two-days'
),
(
  '00000000-0000-4000-8000-000000000796',
  '00000000-0000-4000-8000-000000000101',
  '退款时效更新',
  'manual',
  'available',
  null
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
) values
(
  '00000000-0000-4000-8000-000000000895',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000795',
  '退款时效说明',
  '审核通过后，退款会在２个工作日内原路到账。',
  'https://example.com/refund-two-days',
  'available',
  now()
),
(
  '00000000-0000-4000-8000-000000000896',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000796',
  '退款时效更新',
  '审核通过后，退款会在五个工作日内原路到账。',
  null,
  'available',
  now()
);

update public.knowledge_sources
set current_revision_id = case id
  when '00000000-0000-4000-8000-000000000795'::uuid
    then '00000000-0000-4000-8000-000000000895'::uuid
  else '00000000-0000-4000-8000-000000000896'::uuid
end
where id in (
  '00000000-0000-4000-8000-000000000795',
  '00000000-0000-4000-8000-000000000796'
);

insert into public.content_units (
  id,
  organization_id,
  knowledge_source_id,
  knowledge_revision_id,
  position,
  content,
  embedding
) values
(
  '00000000-0000-4000-8000-000000000995',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000795',
  '00000000-0000-4000-8000-000000000895',
  0,
  '审核通过后，退款会在２个工作日内原路到账。',
  array_fill(0::real, array[1024])::extensions.vector
),
(
  '00000000-0000-4000-8000-000000000996',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000796',
  '00000000-0000-4000-8000-000000000896',
  0,
  '审核通过后，退款会在五个工作日内原路到账。',
  array_fill(0::real, array[1024])::extensions.vector
);

create temporary table published_assistant as
select public_id from public.assistants;

reset role;
grant select on published_assistant to service_role;
grant select on public.messages to service_role;
grant select on public.message_factual_requests to service_role;
grant select on public.evidence_snapshots to service_role;
grant select on public.citations to service_role;
grant select on public.unresolved_questions to service_role;
grant select on public.quality_feedback to service_role;
set local role service_role;

create temporary table first_conflict as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '退款多久到账？'
);

select lives_ok(
  $$
    select public.complete_public_conflict_decision(
      (select public_id from published_assistant),
      (select conversation_id from first_conflict),
      'knowledge_conflict',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001805',
          'order', 1,
          'status', 'conflicting',
          'content',
            '现有知识对这个问题提供了无法同时成立的信息，目前无法给出唯一结论。',
          'citations', jsonb_build_array(
            jsonb_build_object(
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000795',
              'contentUnitId',
                '00000000-0000-4000-8000-000000000995',
              'title', '退款时效说明',
              'url', 'https://example.com/refund-two-days',
              'exactExcerpt', E'\t退款会在2个工作日内原路到账'
            ),
            jsonb_build_object(
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000796',
              'contentUnitId',
                '00000000-0000-4000-8000-000000000996',
              'title', '退款时效更新',
              'url', null,
              'exactExcerpt', '退款会在五个工作日内原路到账'
            )
          )
        )
      ),
      jsonb_build_object(
        'factualRequest', jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001805',
          'originalText', '退款多久到账？',
          'normalizedQuestion', '退款多久到账？',
          'requestAnalysisVersion', 'request-analysis-v1'
        ),
        'coverage', jsonb_build_object(
          'version', 'evidence-coverage-v1',
          'factualRequestId',
            '00000000-0000-4000-8000-000000001805',
          'status', 'conflicting',
          'evidence', jsonb_build_array(
            jsonb_build_object(
              'contentUnitId',
                '00000000-0000-4000-8000-000000000995',
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000795',
              'sourceTitle', '退款时效说明',
              'sourceUrl', 'https://example.com/refund-two-days',
              'relationship', 'conflicts',
              'exactExcerpt', E'\t退款会在2个工作日内原路到账',
              'reason', '同一退款流程给出两个工作日。'
            ),
            jsonb_build_object(
              'contentUnitId',
                '00000000-0000-4000-8000-000000000996',
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000796',
              'sourceTitle', '退款时效更新',
              'sourceUrl', null,
              'relationship', 'conflicts',
              'exactExcerpt', '退款会在五个工作日内原路到账',
              'reason', '同一退款流程给出五个工作日。'
            )
          )
        )
      )
    )
  $$,
  'a validated conflict completes atomically'
);

select results_eq(
  $$
    select message_type, status
    from public.messages
    where id = (select assistant_message_id from first_conflict)
  $$,
  $$ values ('knowledge_conflict', 'completed') $$,
  'the assistant message keeps the conflict result semantics'
);

select results_eq(
  $$
    select coverage_status, response_strategy_version
    from public.message_factual_requests
    where id = '00000000-0000-4000-8000-000000001805'
  $$,
  $$ values ('conflicting', 'knowledge-conflict-v1') $$,
  'the factual request records the conflict decision'
);

select is(
  (
    select count(*)
    from public.evidence_snapshots
    where factual_request_id =
      '00000000-0000-4000-8000-000000001805'
      and relationship = 'conflicts'
  ),
  2::bigint,
  'both sides are persisted as minimal conflict snapshots'
);

select results_eq(
  $$
    select source_title, source_url
    from public.citations
    where message_id = (
      select assistant_message_id from first_conflict
    )
    order by knowledge_source_id
  $$,
  $$
    values
      ('退款时效说明', 'https://example.com/refund-two-days'),
      ('退款时效更新', null::text)
  $$,
  'server citations preserve both source identities'
);

select results_eq(
  $$
    select trigger_type, status, jsonb_array_length(citations)
    from public.unresolved_questions
    where factual_request_id =
      '00000000-0000-4000-8000-000000001805'
  $$,
  $$ values ('knowledge_conflict', 'pending', 2) $$,
  'each conflict creates a pending request-scoped unresolved item'
);

select throws_ok(
  $$
    select public.submit_public_quality_feedback(
      (select public_id from published_assistant),
      (select assistant_message_id from first_conflict),
      'helpful'
    )
  $$,
  '22023',
  'quality feedback target is invalid',
  'knowledge conflicts do not accept quality feedback'
);

create temporary table second_conflict as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '请再次核对退款时间'
);

select public.complete_public_conflict_decision(
  (select public_id from published_assistant),
  (select conversation_id from second_conflict),
  'knowledge_conflict',
  jsonb_build_array(
    jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000001806',
      'order', 1,
      'status', 'conflicting',
      'content', '现有知识存在冲突，无法给出唯一结论。',
      'citations', jsonb_build_array(
        jsonb_build_object(
          'knowledgeSourceId',
            '00000000-0000-4000-8000-000000000795',
          'contentUnitId',
            '00000000-0000-4000-8000-000000000995',
          'title', '退款时效说明',
          'url', 'https://example.com/refund-two-days',
          'exactExcerpt', '退款会在2个工作日内原路到账'
        ),
        jsonb_build_object(
          'knowledgeSourceId',
            '00000000-0000-4000-8000-000000000796',
          'contentUnitId',
            '00000000-0000-4000-8000-000000000996',
          'title', '退款时效更新',
          'url', null,
          'exactExcerpt', '退款会在五个工作日内原路到账'
        )
      )
    )
  ),
  jsonb_build_object(
    'factualRequest', jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000001806',
      'originalText', '请再次核对退款时间',
      'normalizedQuestion', '退款多久到账？',
      'requestAnalysisVersion', 'request-analysis-v1'
    ),
    'coverage', jsonb_build_object(
      'version', 'evidence-coverage-v1',
      'factualRequestId',
        '00000000-0000-4000-8000-000000001806',
      'status', 'conflicting',
      'evidence', jsonb_build_array(
        jsonb_build_object(
          'contentUnitId',
            '00000000-0000-4000-8000-000000000995',
          'knowledgeSourceId',
            '00000000-0000-4000-8000-000000000795',
          'sourceTitle', '退款时效说明',
          'sourceUrl', 'https://example.com/refund-two-days',
          'relationship', 'conflicts',
          'exactExcerpt', '退款会在2个工作日内原路到账',
          'reason', '同一退款流程给出两个工作日。'
        ),
        jsonb_build_object(
          'contentUnitId',
            '00000000-0000-4000-8000-000000000996',
          'knowledgeSourceId',
            '00000000-0000-4000-8000-000000000796',
          'sourceTitle', '退款时效更新',
          'sourceUrl', null,
          'relationship', 'conflicts',
          'exactExcerpt', '退款会在五个工作日内原路到账',
          'reason', '同一退款流程给出五个工作日。'
        )
      )
    )
  )
);

select is(
  (
    select count(*)
    from public.unresolved_questions
    where trigger_type = 'knowledge_conflict'
      and factual_request_id in (
        '00000000-0000-4000-8000-000000001805',
        '00000000-0000-4000-8000-000000001806'
      )
  ),
  2::bigint,
  'repeated conflict requests remain independent unresolved items'
);

reset role;

update public.knowledge_sources
set
  title = '后来修改的标题',
  original_url = 'https://example.com/changed'
where id = '00000000-0000-4000-8000-000000000795';

delete from public.knowledge_sources
where id = '00000000-0000-4000-8000-000000000796';

set local role service_role;

select results_eq(
  $$
    select source_title, source_url, exact_excerpt
    from public.evidence_snapshots
    where factual_request_id =
      '00000000-0000-4000-8000-000000001805'
    order by content_unit_id
  $$,
  $$
    values
      (
        '退款时效说明',
        'https://example.com/refund-two-days',
        E'\t退款会在2个工作日内原路到账'
      ),
      (
        '退款时效更新',
        null,
        '退款会在五个工作日内原路到账'
      )
  $$,
  'conflict snapshots survive later source updates and deletion'
);

select results_eq(
  $$
    select
      citations -> 1 ->> 'title',
      citations -> 1 ->> 'exactExcerpt'
    from public.unresolved_questions
    where factual_request_id =
      '00000000-0000-4000-8000-000000001805'
  $$,
  $$ values ('退款时效更新', '退款会在五个工作日内原路到账') $$,
  'the unresolved item retains its deleted-source snapshot'
);

create temporary table forged_conflict as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '伪造冲突'
);

select throws_ok(
  $$
    select public.complete_public_conflict_decision(
      (select public_id from published_assistant),
      (select conversation_id from forged_conflict),
      'knowledge_conflict',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001807',
          'order', 1,
          'status', 'conflicting',
          'content', '伪造冲突',
          'citations', jsonb_build_array(
            jsonb_build_object(
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000795',
              'contentUnitId',
                '00000000-0000-4000-8000-000000000999',
              'title', '伪造来源',
              'url', null,
              'exactExcerpt', '伪造片段'
            ),
            jsonb_build_object(
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000796',
              'contentUnitId',
                '00000000-0000-4000-8000-000000000996',
              'title', '退款时效更新',
              'url', null,
              'exactExcerpt', '退款会在五个工作日内原路到账'
            )
          )
        )
      ),
      jsonb_build_object(
        'factualRequest', jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001807',
          'originalText', '伪造冲突',
          'normalizedQuestion', '伪造冲突',
          'requestAnalysisVersion', 'request-analysis-v1'
        ),
        'coverage', jsonb_build_object(
          'version', 'evidence-coverage-v1',
          'factualRequestId',
            '00000000-0000-4000-8000-000000001807',
          'status', 'conflicting',
          'evidence', jsonb_build_array(
            jsonb_build_object(
              'contentUnitId',
                '00000000-0000-4000-8000-000000000999',
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000795',
              'sourceTitle', '伪造来源',
              'sourceUrl', null,
              'relationship', 'conflicts',
              'exactExcerpt', '伪造片段',
              'reason', '伪造'
            ),
            jsonb_build_object(
              'contentUnitId',
                '00000000-0000-4000-8000-000000000996',
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000796',
              'sourceTitle', '退款时效更新',
              'sourceUrl', null,
              'relationship', 'conflicts',
              'exactExcerpt', '退款会在五个工作日内原路到账',
              'reason', '原文'
            )
          )
        )
      )
    )
  $$,
  '23514',
  'evidence content unit must be an organization candidate',
  'a forged conflict identity rejects the whole completion'
);

select results_eq(
  $$
    select status, message_type
    from public.messages
    where id = (select assistant_message_id from forged_conflict)
  $$,
  $$ values ('pending', 'grounded_answer') $$,
  'a rejected conflict leaves the pending message unchanged'
);

select throws_ok(
  $$
    select public.complete_public_conflict_decision(
      '00000000-0000-4000-8000-000000009999',
      (select conversation_id from forged_conflict),
      'knowledge_conflict',
      '[]'::jsonb,
      '{}'::jsonb
    )
  $$,
  'P0002',
  'public conversation not found',
  'another assistant identity cannot complete this organization conversation'
);

select * from finish();

rollback;
