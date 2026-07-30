begin;

select plan(8);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.publish_assistant();

create temporary table audit_assistant as
select id, public_id
from public.assistants
where organization_id = '00000000-0000-4000-8000-000000000101';

reset role;
grant select on audit_assistant to service_role;
grant select on public.ai_call_logs to service_role;

insert into public.conversations (
  id,
  organization_id,
  assistant_id,
  visitor_session_id
) values (
  '00000000-0000-4000-8000-000000002201',
  '00000000-0000-4000-8000-000000000101',
  (select id from audit_assistant),
  '00000000-0000-4000-8000-000000002211'
);

insert into public.messages (
  id,
  organization_id,
  conversation_id,
  message_type,
  content,
  status
) values
  (
    '00000000-0000-4000-8000-000000002221',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002201',
    'visitor_question',
    '复盘这个回答',
    'completed'
  ),
  (
    '00000000-0000-4000-8000-000000002222',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002201',
    'grounded_answer',
    '',
    'pending'
  );

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
  request_analysis_version,
  response_strategy_version
) values (
  '00000000-0000-4000-8000-000000002231',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000002201',
  '00000000-0000-4000-8000-000000002221',
  '00000000-0000-4000-8000-000000002222',
  1,
  '复盘这个回答',
  '复盘这个回答',
  'complete',
  'unsupported',
  'request-analysis-v1',
  'response-strategy-v1'
);

set local role service_role;

select lives_ok(
  $$
    select public.record_public_assistant_ai_call(
      (select public_id from audit_assistant),
      'evidence_coverage',
      'test',
      'coverage-v1',
      12,
      4,
      16,
      25,
      'success',
      null,
      'decision-audit-trace',
      '00000000-0000-4000-8000-000000002201',
      '00000000-0000-4000-8000-000000002222',
      '00000000-0000-4000-8000-000000002231'
    )
  $$,
  'public provider calls can be associated with their conversation decision'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      call_type,
      outcome,
      trace_id,
      conversation_id,
      assistant_message_id,
      factual_request_id
    )
    from public.ai_call_logs
    where trace_id = 'decision-audit-trace'
  $$,
  array[
    'evidence_coverage|success|decision-audit-trace'
      || '|00000000-0000-4000-8000-000000002201'
      || '|00000000-0000-4000-8000-000000002222'
      || '|00000000-0000-4000-8000-000000002231'
  ],
  'decision audit logs retain only stage metadata and stable identities'
);

select throws_ok(
  $$
    select public.record_public_assistant_ai_call(
      (select public_id from audit_assistant),
      'answer',
      'test',
      'answer-v1',
      1,
      1,
      2,
      3,
      'success',
      null,
      'forged-decision-audit-trace',
      '00000000-0000-4000-8000-000000002201',
      '00000000-0000-4000-8000-000000000501',
      null
    )
  $$,
  'public AI call audit context is invalid',
  'public call logging rejects a message outside the target conversation'
);

select throws_ok(
  $$
    select public.record_public_assistant_ai_call(
      (select public_id from audit_assistant),
      'evidence_coverage',
      'test',
      'coverage-v1',
      1,
      1,
      2,
      3,
      'success',
      null,
      'orphan-factual-request-trace',
      null,
      null,
      '00000000-0000-4000-8000-000000002231'
    )
  $$,
  'public AI call audit context is invalid',
  'a factual request identity cannot be logged without its conversation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select trace_id
    from public.ai_call_logs
    where conversation_id =
      '00000000-0000-4000-8000-000000002201'
  $$,
  array['decision-audit-trace'],
  'the organization administrator can read correlated decision stages'
);

select throws_ok(
  $$
    insert into public.ai_call_logs (
      organization_id,
      conversation_id,
      assistant_message_id,
      factual_request_id,
      call_type,
      provider,
      model,
      input_tokens,
      output_tokens,
      total_tokens,
      duration_ms,
      outcome,
      error_type,
      trace_id
    ) values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000002201',
      '00000000-0000-4000-8000-000000002222',
      '00000000-0000-4000-8000-000000002231',
      'answer',
      'forged',
      'forged',
      1,
      1,
      2,
      1,
      'success',
      null,
      'administrator-forged-trace'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "ai_call_logs"',
  'administrators cannot forge provider stages associated with a conversation'
);

select results_eq(
  $$
    select coverage_decision_version
    from public.message_factual_requests
    where id = '00000000-0000-4000-8000-000000002231'
  $$,
  array['evidence-coverage-v1'],
  'unsupported factual requests retain the coverage decision version without evidence'
);

delete from public.conversations
where id = '00000000-0000-4000-8000-000000002201';

select is(
  (
    select count(*)::integer
    from public.ai_call_logs
    where trace_id = 'decision-audit-trace'
  ),
  0,
  'deleting a conversation removes its correlated decision audit logs'
);

select * from finish();
rollback;
