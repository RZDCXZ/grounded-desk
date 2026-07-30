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
) values (
  '00000000-0000-4000-8000-000000000793',
  '00000000-0000-4000-8000-000000000101',
  '单项分段契约来源',
  'manual',
  'available',
  'https://example.com/section-contract'
);

create temporary table published_assistant as
select public_id
from public.assistants;

reset role;
grant select on published_assistant to service_role;
grant select on public.citations to service_role;
grant select on public.messages to service_role;
grant select on public.quality_feedback to service_role;
grant select on public.unresolved_questions to service_role;
set local role service_role;

create temporary table grounded_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '你们提供什么服务？'
);

select lives_ok(
  $$
    select public.complete_public_conversation_sections(
      (select public_id from published_assistant),
      (select conversation_id from grounded_request),
      'grounded_answer',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001793',
          'order', 1,
          'status', 'supported',
          'content', '我们提供知识整理服务。',
          'citations', jsonb_build_array(
            jsonb_build_object(
              'knowledgeSourceId',
              '00000000-0000-4000-8000-000000000793'
            )
          )
        )
      )
    )
  $$,
  'a grounded answer completes through one response section'
);

select results_eq(
  $$
    select
      request.id,
      request.request_order,
      request.original_text,
      request.normalized_question,
      request.completeness,
      request.coverage_status,
      request.request_analysis_version,
      request.response_strategy_version
    from public.message_factual_requests as request
    where request.assistant_message_id = (
      select assistant_message_id from grounded_request
    )
  $$,
  $$
    values (
      '00000000-0000-4000-8000-000000001793'::uuid,
      1::smallint,
      '你们提供什么服务？',
      '你们提供什么服务？',
      'complete',
      'supported',
      'legacy-routing-v1',
      'single-section-v1'
    )
  $$,
  'single grounded answers persist the ordered factual request'
);

select results_eq(
  $$
    select
      citation.factual_request_id,
      citation.source_title,
      citation.source_url
    from public.citations as citation
    where citation.message_id = (
      select assistant_message_id from grounded_request
    )
  $$,
  $$
    values (
      '00000000-0000-4000-8000-000000001793'::uuid,
      '单项分段契约来源',
      'https://example.com/section-contract'
    )
  $$,
  'the server citation is associated with the persisted section request'
);

select public.submit_public_quality_feedback(
  (select public_id from published_assistant),
  (select assistant_message_id from grounded_request),
  'helpful'
);

select is(
  (
    select feedback_value
    from public.quality_feedback
    where answer_message_id = (
      select assistant_message_id from grounded_request
    )
  ),
  'helpful',
  'single grounded answers keep the existing quality feedback behavior'
);

create temporary table refusal_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '价格是多少？'
);

select lives_ok(
  $$
    select public.complete_public_conversation_sections(
      (select public_id from published_assistant),
      (select conversation_id from refusal_request),
      'grounded_refusal',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001794',
          'order', 1,
          'status', 'unsupported',
          'content', '当前可用知识不足以支持这个问题的事实性回答。',
          'citations', '[]'::jsonb,
          'contact', jsonb_build_object(
            'label', '联系人工',
            'url', 'mailto:admin@groundeddesk.local'
          )
        )
      )
    )
  $$,
  'a grounded refusal completes through the same section contract'
);

select is(
  (
    select count(*)
    from public.unresolved_questions
    where answer_message_id = (
      select assistant_message_id from refusal_request
    )
      and trigger_type = 'grounded_refusal'
  ),
  1::bigint,
  'the migrated refusal keeps one unresolved question'
);

create temporary table conversational_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '你好',
  null,
  false,
  100,
  6,
  false
);

select public.complete_public_conversation_sections(
  (select public_id from published_assistant),
  (select conversation_id from conversational_request),
  'conversational_response',
  jsonb_build_array(
    jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000001795',
      'order', 1,
      'status', 'conversational',
      'content', '您好，我可以帮助您了解服务范围内的信息。',
      'citations', '[]'::jsonb
    )
  )
);

create temporary table clarification_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '退款'
);

select public.complete_public_conversation_sections(
  (select public_id from published_assistant),
  (select conversation_id from clarification_request),
  'clarification_request',
  jsonb_build_array(
    jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000001796',
      'order', 1,
      'status', 'clarification',
      'content', '您想了解退款的哪一方面？',
      'citations', '[]'::jsonb
    )
  )
);

select results_eq(
  $$
    select message_type
    from public.messages
    where id in (
      (select assistant_message_id from conversational_request),
      (select assistant_message_id from clarification_request)
    )
    order by message_type
  $$,
  $$
    values
      ('clarification_request'),
      ('conversational_response')
  $$,
  'conversational and clarification results share the completion contract'
);

select is(
  (
    select count(*)
    from public.citations
    where message_id in (
      (select assistant_message_id from refusal_request),
      (select assistant_message_id from conversational_request),
      (select assistant_message_id from clarification_request)
    )
  ),
  0::bigint,
  'non-answer sections cannot acquire citations'
);

select is(
  (
    select count(*)
    from public.message_factual_requests
    where assistant_message_id in (
      (select assistant_message_id from refusal_request),
      (select assistant_message_id from conversational_request),
      (select assistant_message_id from clarification_request)
    )
  ),
  0::bigint,
  'the compatibility migration does not infer requests for old non-answer outcomes'
);

create temporary table invalid_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '无效分段'
);

select throws_ok(
  $$
    select public.complete_public_conversation_sections(
      (select public_id from published_assistant),
      (select conversation_id from invalid_request),
      'grounded_answer',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001797',
          'order', 1,
          'status', 'unsupported',
          'content', '状态与结果不匹配。',
          'citations', '[]'::jsonb
        )
      )
    )
  $$,
  '22023',
  'response section status does not match result type',
  'the server rejects a section status that conflicts with the message result'
);

select is(
  (
    select status
    from public.messages
    where id = (select assistant_message_id from invalid_request)
  ),
  'pending',
  'invalid section completion leaves the assistant message pending'
);

create temporary table fractional_order_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '无效顺序'
);

select throws_ok(
  $$
    select public.complete_public_conversation_sections(
      (select public_id from published_assistant),
      (select conversation_id from fractional_order_request),
      'grounded_answer',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001798',
          'order', 1.1,
          'status', 'supported',
          'content', '小数顺序不应被接受。',
          'citations', '[]'::jsonb
        )
      )
    )
  $$,
  '22023',
  'response section values are invalid',
  'the server rejects a fractional response section order'
);

select is(
  (
    select status
    from public.messages
    where id = (
      select assistant_message_id from fractional_order_request
    )
  ),
  'pending',
  'a fractional order leaves the assistant message pending'
);

select * from finish();
rollback;
