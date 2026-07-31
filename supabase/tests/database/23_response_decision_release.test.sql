begin;

select plan(10);

select has_column(
  'public',
  'messages',
  'response_decision_strategy_version',
  'message audit stores the release strategy version'
);

select col_is_null(
  'public',
  'messages',
  'response_decision_strategy_version',
  'release strategy remains nullable for historical messages'
);

select results_eq(
  $$
    select
      (trigger.tgtype & 4) = 4
      and (trigger.tgtype & 16) = 16
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.messages'::regclass
      and trigger.tgname =
        'assign_message_response_decision_strategy_version'
      and not trigger.tgisinternal
  $$,
  array[true],
  'release version is controlled on message creation and completion'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select public.publish_assistant();

create temporary table release_assistant as
select id
from public.assistants
where organization_id = '00000000-0000-4000-8000-000000000101';

reset role;

insert into public.conversations (
  id,
  organization_id,
  assistant_id,
  visitor_session_id
) values (
  '00000000-0000-4000-8000-000000002301',
  '00000000-0000-4000-8000-000000000101',
  (select id from release_assistant),
  '00000000-0000-4000-8000-000000002311'
);

insert into public.messages (
  id,
  organization_id,
  conversation_id,
  message_type,
  content,
  status,
  response_decision_strategy_version
) values
  (
    '00000000-0000-4000-8000-000000002321',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002301',
    'visitor_question',
    '发布策略是什么？',
    'completed',
    'client-supplied-version'
  ),
  (
    '00000000-0000-4000-8000-000000002322',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002301',
    'grounded_answer',
    '',
    'pending',
    'client-supplied-version'
  ),
  (
    '00000000-0000-4000-8000-000000002323',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002301',
    'conversational_response',
    '历史交流回应',
    'completed',
    'client-supplied-version'
  );

select results_eq(
  $$
    select response_decision_strategy_version
    from public.messages
    where id in (
      '00000000-0000-4000-8000-000000002321',
      '00000000-0000-4000-8000-000000002322',
      '00000000-0000-4000-8000-000000002323'
    )
    order by id
  $$,
  array[null::text, null::text, null::text],
  'untrusted inserts cannot choose a release version'
);

update public.messages
set
  message_type = 'conversational_response',
  content = '当前发布流的交流回应',
  status = 'completed'
where id = '00000000-0000-4000-8000-000000002322';

select results_eq(
  $$
    select response_decision_strategy_version
    from public.messages
    where id = '00000000-0000-4000-8000-000000002322'
  $$,
  array['structured-evidence-v1.a13dc1d89b2b'::text],
  'the approved release version is assigned on finalization'
);

update public.messages
set response_decision_strategy_version = 'forged-version'
where id = '00000000-0000-4000-8000-000000002322';

select results_eq(
  $$
    select response_decision_strategy_version
    from public.messages
    where id = '00000000-0000-4000-8000-000000002322'
  $$,
  array['structured-evidence-v1.a13dc1d89b2b'::text],
  'completed release versions cannot be rewritten'
);

update public.messages
set content = '历史内容保持原样'
where id = '00000000-0000-4000-8000-000000002323';

select results_eq(
  $$
    select response_decision_strategy_version
    from public.messages
    where id = '00000000-0000-4000-8000-000000002323'
  $$,
  array[null::text],
  'historical messages remain unlabeled when content changes'
);

select is(
  (
    select content
    from public.messages
    where id = '00000000-0000-4000-8000-000000002323'
  ),
  '历史内容保持原样',
  'historical response content is not reclassified'
);

select is(
  (
    select count(*)
    from public.citations
    where conversation_id = '00000000-0000-4000-8000-000000002301'
  ),
  0::bigint,
  'release finalization does not rewrite historical citations'
);

select is(
  (
    select count(*)
    from public.unresolved_questions
    where conversation_id = '00000000-0000-4000-8000-000000002301'
  ),
  0::bigint,
  'release finalization does not create historical unresolved questions'
);

select * from finish();

rollback;
