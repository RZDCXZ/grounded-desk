begin;

select plan(15);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.publish_assistant();

create temporary table published_assistant as
select public_id
from public.assistants;

reset role;
grant select on published_assistant to anon, authenticated, service_role;
set local role service_role;

create temporary table refusal_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '你们在新加坡有办公室吗？'
);

grant select on refusal_request to authenticated, service_role;

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from refusal_request),
  'grounded_refusal',
  '现有知识暂时无法确认，请联系人工服务。',
  '[]'::jsonb
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.unresolved_questions),
  1::bigint,
  'a grounded refusal automatically creates one unresolved question'
);

select results_eq(
  $$
    select
      trigger_type,
      status,
      question,
      answer_content,
      citations
    from public.unresolved_questions
  $$,
  $$
    values (
      'grounded_refusal',
      'pending',
      '你们在新加坡有办公室吗？',
      '现有知识暂时无法确认，请联系人工服务。',
      '[]'::jsonb
    )
  $$,
  'the refusal item preserves the question, answer, empty citation snapshot, and pending state'
);

select is(
  (
    select unresolved.conversation_id
    from public.unresolved_questions as unresolved
  ),
  (select conversation_id from refusal_request),
  'the refusal item remains associated with its conversation'
);

reset role;
set local role service_role;

create temporary table answered_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '如何申请 API 密钥？'
);

grant select on answered_request to anon, authenticated, service_role;

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from answered_request),
  'grounded_answer',
  '请在设置页面申请 API 密钥。',
  jsonb_build_array(
    jsonb_build_object(
      'knowledgeSourceId',
      '00000000-0000-4000-8000-000000000701',
      'title',
      'API 密钥说明',
      'url',
      'https://example.com/api-keys'
    )
  )
);

select public.submit_public_quality_feedback(
  (select public_id from published_assistant),
  (select assistant_message_id from answered_request),
  'helpful'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.quality_feedback),
  1::bigint,
  'helpful feedback creates one quality feedback record'
);

select is(
  (select feedback_value from public.quality_feedback),
  'helpful',
  'the feedback record stores the visitor choice'
);

select is(
  (select count(*) from public.unresolved_questions),
  1::bigint,
  'helpful feedback does not create an unresolved question'
);

reset role;
set local role service_role;

select public.submit_public_quality_feedback(
  (select public_id from published_assistant),
  (select assistant_message_id from answered_request),
  'helpful'
);

select public.submit_public_quality_feedback(
  (select public_id from published_assistant),
  (select assistant_message_id from answered_request),
  'unhelpful'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.quality_feedback),
  1::bigint,
  'repeating or changing feedback keeps one record for the answer'
);

select is(
  (select feedback_value from public.quality_feedback),
  'unhelpful',
  'changing feedback updates the existing record'
);

select is(
  (select count(*) from public.unresolved_questions),
  2::bigint,
  'changing to unhelpful creates one additional unresolved question'
);

select results_eq(
  $$
    select
      unresolved.trigger_type,
      unresolved.question,
      unresolved.answer_content,
      unresolved.citations,
      unresolved.conversation_id
    from public.unresolved_questions as unresolved
    where unresolved.answer_message_id = (
      select assistant_message_id from answered_request
    )
  $$,
  $$
    values (
      'negative_feedback',
      '如何申请 API 密钥？',
      '请在设置页面申请 API 密钥。',
      jsonb_build_array(
        jsonb_build_object(
          'knowledgeSourceId',
          '00000000-0000-4000-8000-000000000701',
          'title',
          'API 密钥说明',
          'url',
          'https://example.com/api-keys'
        )
      ),
      (select conversation_id from answered_request)
    )
  $$,
  'negative feedback preserves the original exchange, citation snapshot, and conversation association'
);

reset role;
set local role service_role;

select public.submit_public_quality_feedback(
  (select public_id from published_assistant),
  (select assistant_message_id from answered_request),
  'unhelpful'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select
      (select count(*) from public.quality_feedback)::integer,
      (select count(*) from public.unresolved_questions)::integer
  $$,
  $$ values (1, 2) $$,
  'duplicate negative feedback creates neither duplicate feedback nor duplicate unresolved questions'
);

reset role;
set local role service_role;

create temporary table failed_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '读取实时配额'
);

grant select on failed_request to authenticated, service_role;

select public.fail_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from failed_request)
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.unresolved_questions),
  2::bigint,
  'a technical failure does not create an unresolved question'
);

select lives_ok(
  $$
    update public.unresolved_questions
    set
      status = 'resolved',
      resolved_at = now()
    where answer_message_id = (
      select assistant_message_id from answered_request
    )
  $$,
  'an administrator can resolve an unresolved question'
);

reset role;
set local role anon;

select throws_ok(
  $$
    select public.submit_public_quality_feedback(
      (select public_id from published_assistant),
      (select assistant_message_id from answered_request),
      'helpful'
    )
  $$,
  '42501',
  'permission denied for function submit_public_quality_feedback',
  'the anonymous database role cannot bypass the public HTTP feedback gateway'
);

reset role;
set local role service_role;

select throws_ok(
  $$
    select public.submit_public_quality_feedback(
      (select public_id from published_assistant),
      (select assistant_message_id from failed_request),
      'unhelpful'
    )
  $$,
  '22023',
  'quality feedback target is invalid',
  'technical failures cannot receive quality feedback or enter the improvement queue'
);

select * from finish();
rollback;
