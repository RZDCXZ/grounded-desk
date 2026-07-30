begin;

select plan(25);

select is(
  (select public_id from public.assistants limit 1),
  null::uuid,
  'draft assistant has no public identifier'
);

set local role service_role;

select is_empty(
  $$
    select *
    from public.get_published_assistant(
      '00000000-0000-4000-8000-000000000301'
    )
  $$,
  'draft assistant is not available through the public resolver'
);

select throws_ok(
  $$
    select *
    from public.begin_public_conversation(
      '00000000-0000-4000-8000-000000000301',
      '草稿助手不应保存这个问题'
    )
  $$,
  'P0002',
  'published assistant not found',
  'draft assistant cannot start a public conversation'
);

reset role;
set local role anon;

select throws_ok(
  $$
    select *
    from public.get_published_assistant(
      '00000000-0000-4000-8000-000000000301'
    )
  $$,
  '42501',
  'permission denied for function get_published_assistant',
  'anonymous database role cannot resolve assistant configuration directly'
);

select throws_ok(
  $$
    select *
    from public.begin_public_conversation(
      '00000000-0000-4000-8000-000000000301',
      '匿名数据库角色不应直接创建会话'
    )
  $$,
  '42501',
  'permission denied for function begin_public_conversation',
  'anonymous database role cannot call the public conversation gateway directly'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.publish_assistant() $$,
  '42501',
  'administrator organization not found',
  'authenticated non-member cannot publish an assistant'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.publish_assistant() $$,
  'administrator can publish the assistant'
);

select results_eq(
  $$ select status from public.assistants $$,
  array['published'],
  'publishing changes the assistant status'
);

select isnt(
  (select public_id from public.assistants limit 1),
  null::uuid,
  'first publication creates a public identifier'
);

insert into public.knowledge_sources (
  id,
  organization_id,
  title,
  source_type,
  status,
  original_url
) values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000101',
  '服务说明',
  'manual',
  'available',
  'https://example.com/services'
);

create temporary table first_publication as
select public_id
from public.assistants;

grant select on first_publication to anon, authenticated, service_role;

do $$
begin
  perform public.publish_assistant();
end;
$$;

select results_eq(
  $$
    select assistant.public_id::text
    from public.assistants as assistant
    join first_publication as first
      on first.public_id = assistant.public_id
  $$,
  $$ select public_id::text from first_publication $$,
  'publishing again preserves the public identifier'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select name, welcome_message, human_contact_label, human_contact_url
    from public.get_published_assistant(
      (select public_id from first_publication)
    )
  $$,
  $$
    values (
      '演示网站服务助手',
      '你好，我是 GroundedDesk 演示助手。你可以询问服务范围和支持方式。',
      '联系人工',
      'mailto:admin@groundeddesk.local'
    )
  $$,
  'published assistant exposes only visitor-facing configuration'
);

create temporary table started_public_conversation as
select *
from public.begin_public_conversation(
  (select public_id from first_publication),
  '你们提供什么服务？'
);

grant select on started_public_conversation to authenticated, service_role;

select is(
  (select count(*) from started_public_conversation),
  1::bigint,
  'visitor can start an anonymous conversation without profile data'
);

reset role;
set local role anon;

select throws_ok(
  $$ select id from public.conversations $$,
  '42501',
  'permission denied for table conversations',
  'visitor cannot read conversation tables directly'
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
    select organization_id::text, assistant_id::text
    from public.conversations
    order by created_at desc
    limit 1
  $$,
  $$
    values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000201'
    )
  $$,
  'conversation ownership is derived from the published assistant'
);

select results_eq(
  $$
    select message_type, content, status
    from public.messages
    order by
      case message_type
        when 'visitor_question' then 1
        else 2
      end
  $$,
  $$
    values
      ('visitor_question', '你们提供什么服务？', 'completed'),
      ('grounded_answer', '', 'pending')
  $$,
  'starting a conversation saves the visitor question and answer placeholder'
);

reset role;
set local role service_role;

select lives_ok(
  $$
    select public.complete_public_conversation(
      (select public_id from first_publication),
      (select conversation_id from started_public_conversation),
      'grounded_answer',
      '我们提供知识整理服务。',
      jsonb_build_array(
        jsonb_build_object(
          'knowledgeSourceId',
          '00000000-0000-4000-8000-000000000701',
          'title',
          '服务说明',
          'url',
          'https://example.com/services'
        )
      )
    )
  $$,
  'completed answer and citation snapshots can be persisted'
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
    select message_type, content, status
    from public.messages
    where message_type = 'grounded_answer'
  $$,
  $$
    values (
      'grounded_answer',
      '我们提供知识整理服务。',
      'completed'
    )
  $$,
  'completed grounded answer remains in conversation history'
);

select results_eq(
  $$ select source_title, source_url from public.citations $$,
  $$
    values (
      '服务说明',
      'https://example.com/services'
    )
  $$,
  'answer stores a server-provided citation snapshot'
);

select lives_ok(
  $$ select public.take_assistant_offline() $$,
  'administrator can take the assistant offline'
);

select results_eq(
  $$ select status from public.assistants $$,
  array['offline'],
  'taking the assistant offline changes its status'
);

select results_eq(
  $$
    select assistant.public_id::text
    from public.assistants as assistant
    join first_publication as first
      on first.public_id = assistant.public_id
  $$,
  $$ select public_id::text from first_publication $$,
  'taking the assistant offline preserves its public identifier'
);

select is(
  (select count(*) from public.conversations),
  1::bigint,
  'taking the assistant offline preserves conversation history'
);

select results_eq(
  $$
    select
      (select count(*) from public.messages)::integer,
      (select count(*) from public.citations)::integer
  $$,
  $$ values (2, 1) $$,
  'taking the assistant offline preserves messages and citation snapshots'
);

reset role;
set local role service_role;

select is_empty(
  $$
    select *
    from public.get_published_assistant(
      (select public_id from first_publication)
    )
  $$,
  'offline assistant is not available through the public resolver'
);

select throws_ok(
  $$
    select *
    from public.begin_public_conversation(
      (select public_id from first_publication),
      '下线后不应保存这个问题'
    )
  $$,
  'P0002',
  'published assistant not found',
  'offline assistant rejects new public conversations'
);

select * from finish();
rollback;
