begin;

select plan(18);

select results_eq(
  $$ select count(*)::integer from public.organizations $$,
  array[1],
  'seed creates one demonstration organization'
);

select results_eq(
  $$ select count(*)::integer from public.organization_members where role = 'administrator' $$,
  array[1],
  'seed creates one administrator membership'
);

select results_eq(
  $$ select count(*)::integer from public.assistants where status = 'draft' $$,
  array[1],
  'seed creates one draft assistant'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.organizations'::regclass
  ),
  'organizations has row level security'
);

insert into public.knowledge_sources (
  id,
  organization_id,
  title,
  source_type,
  status
) values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000101',
  'RLS 测试知识来源',
  'manual',
  'available'
);

insert into public.conversations (
  id,
  organization_id,
  assistant_id,
  visitor_session_id
) values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000601'
);

insert into public.unresolved_questions (
  id,
  organization_id,
  conversation_id,
  question,
  trigger_type
) values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000501',
  'RLS 测试问题',
  'grounded_refusal'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$ select name from public.organizations $$,
  array['GroundedDesk 演示组织'],
  'administrator can read their organization'
);

select results_eq(
  $$ select status from public.assistants $$,
  array['draft'],
  'administrator can read the seeded assistant'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);

select is_empty(
  $$ select id from public.organizations $$,
  'authenticated non-member cannot read organization data'
);

select is_empty(
  $$ select organization_id from public.organization_members $$,
  'authenticated non-member cannot read organization memberships'
);

select is_empty(
  $$ select id from public.assistants $$,
  'authenticated non-member cannot read assistants'
);

select is_empty(
  $$ select id from public.knowledge_sources $$,
  'authenticated non-member cannot read knowledge sources'
);

select is_empty(
  $$ select id from public.conversations $$,
  'authenticated non-member cannot read conversations'
);

select is_empty(
  $$ select id from public.unresolved_questions $$,
  'authenticated non-member cannot read unresolved questions'
);

reset role;
set local role anon;

select throws_ok(
  $$ select id from public.organizations $$,
  '42501',
  'permission denied for table organizations',
  'anonymous role cannot read organization data directly'
);

select throws_ok(
  $$ select organization_id from public.organization_members $$,
  '42501',
  'permission denied for table organization_members',
  'anonymous role cannot read organization memberships directly'
);

select throws_ok(
  $$ select id from public.assistants $$,
  '42501',
  'permission denied for table assistants',
  'anonymous role cannot read assistants directly'
);

select throws_ok(
  $$ select id from public.knowledge_sources $$,
  '42501',
  'permission denied for table knowledge_sources',
  'anonymous role cannot read knowledge sources directly'
);

select throws_ok(
  $$ select id from public.conversations $$,
  '42501',
  'permission denied for table conversations',
  'anonymous role cannot read conversations directly'
);

select throws_ok(
  $$ select id from public.unresolved_questions $$,
  '42501',
  'permission denied for table unresolved_questions',
  'anonymous role cannot read unresolved questions directly'
);

select * from finish();
rollback;
