begin;

select plan(8);

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
  '00000000-0000-4000-8000-000000000797',
  '00000000-0000-4000-8000-000000000101',
  '退款与发票说明',
  'manual',
  'available',
  'https://example.com/refund'
),
(
  '00000000-0000-4000-8000-000000000798',
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
  '00000000-0000-4000-8000-000000000897',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000797',
  '退款与发票说明',
  '审核通过后，退款会在两个工作日内到账。企业订单可以开具电子发票。',
  'https://example.com/refund',
  'available',
  now()
),
(
  '00000000-0000-4000-8000-000000000898',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000798',
  '退款时效更新',
  '审核通过后，退款会在五个工作日内到账。',
  null,
  'available',
  now()
);

update public.knowledge_sources
set current_revision_id = case id
  when '00000000-0000-4000-8000-000000000797'::uuid
    then '00000000-0000-4000-8000-000000000897'::uuid
  else '00000000-0000-4000-8000-000000000898'::uuid
end
where id in (
  '00000000-0000-4000-8000-000000000797',
  '00000000-0000-4000-8000-000000000798'
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
  '00000000-0000-4000-8000-000000000997',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000797',
  '00000000-0000-4000-8000-000000000897',
  0,
  '审核通过后，退款会在两个工作日内到账。企业订单可以开具电子发票。',
  array_fill(0::real, array[1024])::extensions.vector
),
(
  '00000000-0000-4000-8000-000000000998',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000798',
  '00000000-0000-4000-8000-000000000898',
  0,
  '审核通过后，退款会在五个工作日内到账。',
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

create temporary table multi_exchange as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '退款多久到账？能开发票吗？退款政策是否一致？'
);

select lives_ok(
  $$
    select public.complete_public_multi_request_decision(
      (select public_id from published_assistant),
      (select conversation_id from multi_exchange),
      'partially_grounded_answer',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001901',
          'order', 1,
          'title', '退款多久到账？',
          'status', 'supported',
          'content', '审核通过后，退款会在两个工作日内到账。',
          'citations', jsonb_build_array(
            jsonb_build_object(
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000797',
              'title', '退款与发票说明',
              'url', 'https://example.com/refund'
            )
          )
        ),
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001902',
          'order', 2,
          'title', '能开发票吗？',
          'status', 'unsupported',
          'content', '当前可用知识不足以支持这个问题的事实性回答。',
          'citations', '[]'::jsonb,
          'contact', jsonb_build_object(
            'label', '联系业务团队',
            'url', 'https://example.com/contact'
          )
        ),
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001903',
          'order', 3,
          'title', '退款政策是否一致？',
          'status', 'conflicting',
          'content', '现有知识存在无法同时成立的信息。',
          'citations', jsonb_build_array(
            jsonb_build_object(
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000797',
              'contentUnitId',
                '00000000-0000-4000-8000-000000000997',
              'title', '退款与发票说明',
              'url', 'https://example.com/refund',
              'exactExcerpt', '退款会在两个工作日内到账'
            ),
            jsonb_build_object(
              'knowledgeSourceId',
                '00000000-0000-4000-8000-000000000798',
              'contentUnitId',
                '00000000-0000-4000-8000-000000000998',
              'title', '退款时效更新',
              'url', null,
              'exactExcerpt', '退款会在五个工作日内到账'
            )
          )
        )
      ),
      jsonb_build_object(
        'version', 'multi-request-decision-v1',
        'requestAnalysisVersion', 'request-analysis-v1',
        'responseStrategyVersion', 'multi-request-response-v1',
        'resultType', 'partially_grounded_answer',
        'requests', jsonb_build_array(
          jsonb_build_object(
            'factualRequest', jsonb_build_object(
              'id', '00000000-0000-4000-8000-000000001901',
              'order', 1,
              'originalText', '退款多久到账？',
              'normalizedQuestion', '退款多久到账？',
              'completeness', 'complete',
              'missingInformation', '[]'::jsonb,
              'clarificationRound', 0
            ),
            'outcome', 'supported',
            'coverage', jsonb_build_object(
              'version', 'evidence-coverage-v1',
              'factualRequestId',
                '00000000-0000-4000-8000-000000001901',
              'status', 'supported',
              'evidence', jsonb_build_array(
                jsonb_build_object(
                  'contentUnitId',
                    '00000000-0000-4000-8000-000000000997',
                  'knowledgeSourceId',
                    '00000000-0000-4000-8000-000000000797',
                  'sourceTitle', '退款与发票说明',
                  'sourceUrl', 'https://example.com/refund',
                  'relationship', 'supports',
                  'exactExcerpt', '退款会在两个工作日内到账',
                  'reason', '原文直接说明退款时效。'
                )
              )
            )
          ),
          jsonb_build_object(
            'factualRequest', jsonb_build_object(
              'id', '00000000-0000-4000-8000-000000001902',
              'order', 2,
              'originalText', '能开发票吗？',
              'normalizedQuestion', '能开发票吗？',
              'completeness', 'complete',
              'missingInformation', '[]'::jsonb,
              'clarificationRound', 0
            ),
            'outcome', 'unsupported',
            'coverage', jsonb_build_object(
              'version', 'evidence-coverage-v1',
              'factualRequestId',
                '00000000-0000-4000-8000-000000001902',
              'status', 'unsupported',
              'evidence', '[]'::jsonb
            )
          ),
          jsonb_build_object(
            'factualRequest', jsonb_build_object(
              'id', '00000000-0000-4000-8000-000000001903',
              'order', 3,
              'originalText', '退款政策是否一致？',
              'normalizedQuestion', '退款政策是否一致？',
              'completeness', 'complete',
              'missingInformation', '[]'::jsonb,
              'clarificationRound', 0
            ),
            'outcome', 'conflicting',
            'coverage', jsonb_build_object(
              'version', 'evidence-coverage-v1',
              'factualRequestId',
                '00000000-0000-4000-8000-000000001903',
              'status', 'conflicting',
              'evidence', jsonb_build_array(
                jsonb_build_object(
                  'contentUnitId',
                    '00000000-0000-4000-8000-000000000997',
                  'knowledgeSourceId',
                    '00000000-0000-4000-8000-000000000797',
                  'sourceTitle', '退款与发票说明',
                  'sourceUrl', 'https://example.com/refund',
                  'relationship', 'conflicts',
                  'exactExcerpt', '退款会在两个工作日内到账',
                  'reason', '来源给出两个工作日。'
                ),
                jsonb_build_object(
                  'contentUnitId',
                    '00000000-0000-4000-8000-000000000998',
                  'knowledgeSourceId',
                    '00000000-0000-4000-8000-000000000798',
                  'sourceTitle', '退款时效更新',
                  'sourceUrl', null,
                  'relationship', 'conflicts',
                  'exactExcerpt', '退款会在五个工作日内到账',
                  'reason', '来源给出五个工作日。'
                )
              )
            )
          )
        )
      )
    )
  $$,
  'three independent request decisions complete atomically'
);

select results_eq(
  $$
    select message_type, status
    from public.messages
    where id = (select assistant_message_id from multi_exchange)
  $$,
  $$ values ('partially_grounded_answer', 'completed') $$,
  'the message keeps partial-answer semantics'
);

select results_eq(
  $$
    select
      request_order,
      coverage_status,
      response_status,
      response_content
    from public.message_factual_requests
    where assistant_message_id =
      (select assistant_message_id from multi_exchange)
    order by request_order
  $$,
  $$
    values
      (1::smallint, 'supported'::text, 'supported'::text,
        '审核通过后，退款会在两个工作日内到账。'::text),
      (2::smallint, 'unsupported'::text, 'unsupported'::text,
        '当前可用知识不足以支持这个问题的事实性回答。'::text),
      (3::smallint, 'conflicting'::text, 'conflicting'::text,
        '现有知识存在无法同时成立的信息。'::text)
  $$,
  'every request keeps its own ordered outcome and response'
);

select results_eq(
  $$
    select request_order, count(citation.id)::bigint
    from public.message_factual_requests as request
    left join public.citations as citation
      on citation.factual_request_id = request.id
    where request.assistant_message_id =
      (select assistant_message_id from multi_exchange)
    group by request.id, request.request_order
    order by request.request_order
  $$,
  $$ values (1::smallint, 1::bigint),
            (2::smallint, 0::bigint),
            (3::smallint, 2::bigint) $$,
  'citations remain bound to their factual request'
);

select results_eq(
  $$
    select request_order, unresolved.trigger_type
    from public.unresolved_questions as unresolved
    join public.message_factual_requests as request
      on request.id = unresolved.factual_request_id
    where unresolved.answer_message_id =
      (select assistant_message_id from multi_exchange)
    order by request.request_order
  $$,
  $$ values (2::smallint, 'unsupported_factual_request'::text),
            (3::smallint, 'knowledge_conflict'::text) $$,
  'unsupported and conflicting requests create independent unresolved items'
);

select is(
  (
    select count(*)::integer
    from public.unresolved_questions
    where answer_message_id =
      (select assistant_message_id from multi_exchange)
      and factual_request_id is null
  ),
  0,
  'partial completion does not create a whole-message refusal'
);

select public.submit_public_quality_feedback(
  (select public_id from published_assistant),
  (select assistant_message_id from multi_exchange),
  'unhelpful'
);

select is(
  (
    select count(*)::integer
    from public.unresolved_questions
    where answer_message_id =
      (select assistant_message_id from multi_exchange)
  ),
  3,
  'negative feedback adds a quality issue without replacing request gaps'
);

select is(
  (
    select count(*)::integer
    from public.evidence_snapshots
    where conversation_id =
      (select conversation_id from multi_exchange)
  ),
  3,
  'supported and conflicting evidence remains auditable per request'
);

select * from finish();
rollback;
