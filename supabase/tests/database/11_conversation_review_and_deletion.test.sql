begin;

select plan(17);

insert into public.organizations (id, name, slug)
values (
  '00000000-0000-4000-8000-000000000102',
  '其他组织',
  'another-organization'
);

insert into public.assistants (
  id,
  organization_id,
  name,
  welcome_message,
  service_scope,
  tone,
  human_contact_label,
  human_contact_url,
  status,
  public_id
) values (
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000102',
  '其他助手',
  '你好',
  '其他组织服务',
  'professional',
  '联系人工',
  'mailto:other@example.com',
  'draft',
  null
);

insert into public.knowledge_sources (
  id,
  organization_id,
  title,
  source_type,
  status,
  enabled
) values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000101',
  '应保留的知识来源',
  'manual',
  'available',
  true
);

insert into public.conversations (
  id,
  organization_id,
  assistant_id,
  visitor_session_id,
  created_at,
  last_activity_at
) values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000411',
    now() - interval '1 hour',
    now() - interval '30 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000412',
    now() - interval '2 hours',
    now() - interval '90 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000413',
    now() - interval '31 days',
    now() - interval '31 days'
  ),
  (
    '00000000-0000-4000-8000-000000000404',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000414',
    now() - interval '10 minutes',
    now() - interval '5 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000405',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000415',
    now() - interval '3 hours',
    now() - interval '3 hours'
  );

insert into public.messages (
  id,
  organization_id,
  conversation_id,
  message_type,
  content,
  status,
  created_at
) values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000401',
    'visitor_question',
    '最初的问题',
    'completed',
    now() - interval '55 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000401',
    'grounded_answer',
    '最初的有据回答',
    'completed',
    now() - interval '50 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000401',
    'visitor_question',
    '最近的问题',
    'completed',
    now() - interval '35 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000504',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000401',
    'grounded_answer',
    '最近的有据回答',
    'completed',
    now() - interval '30 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000511',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000402',
    'visitor_question',
    '知识范围外的问题',
    'completed',
    now() - interval '100 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000512',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000402',
    'grounded_refusal',
    '现有知识暂时无法确认',
    'completed',
    now() - interval '90 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000521',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000403',
    'visitor_question',
    '过期会话的问题',
    'completed',
    now() - interval '31 days'
  ),
  (
    '00000000-0000-4000-8000-000000000531',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000404',
    'visitor_question',
    '其他组织的问题',
    'completed',
    now() - interval '5 minutes'
  ),
  (
    '00000000-0000-4000-8000-000000000541',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000405',
    'visitor_question',
    '仍在生成的问题',
    'completed',
    now() - interval '3 hours'
  ),
  (
    '00000000-0000-4000-8000-000000000542',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000405',
    'grounded_answer',
    '',
    'pending',
    now() - interval '3 hours'
  );

insert into public.citations (
  id,
  organization_id,
  conversation_id,
  message_id,
  knowledge_source_id,
  source_title,
  source_url
) values (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000504',
  null,
  '生成时保存的标题',
  'https://example.com/snapshot'
);

insert into public.quality_feedback (
  id,
  organization_id,
  conversation_id,
  answer_message_id,
  feedback_value
) values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000504',
  'unhelpful'
);

insert into public.unresolved_questions (
  id,
  organization_id,
  conversation_id,
  question_message_id,
  answer_message_id,
  question,
  answer_content,
  citations,
  trigger_type,
  status
) values (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000503',
  '00000000-0000-4000-8000-000000000504',
  '最近的问题',
  '最近的有据回答',
  jsonb_build_array(
    jsonb_build_object(
      'knowledgeSourceId',
      null,
      'title',
      '生成时保存的标题',
      'url',
      'https://example.com/snapshot'
    )
  ),
  'negative_feedback',
  'pending'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.list_recent_conversations()),
  3::bigint,
  'the administrator list contains only conversations created in their organization during the last thirty days'
);

select results_eq(
  $$
    select
      question_summary,
      result_type,
      feedback_value,
      question_count
    from public.list_recent_conversations()
    where id = '00000000-0000-4000-8000-000000000401'
  $$,
  $$
    values (
      '最初的问题',
      'grounded_answer',
      'unhelpful',
      2::bigint
    )
  $$,
  'the list summarizes the latest question, answer result, feedback, and question count'
);

select results_eq(
  $$
    select question_summary, result_type, feedback_value
    from public.list_recent_conversations()
    where id = '00000000-0000-4000-8000-000000000402'
  $$,
  $$
    values (
      '知识范围外的问题',
      'grounded_refusal',
      null::text
    )
  $$,
  'the list distinguishes a reliable refusal without inventing feedback'
);

select results_eq(
  $$
    select question_summary, result_type
    from public.list_recent_conversations()
    where id = '00000000-0000-4000-8000-000000000405'
  $$,
  $$
    values ('仍在生成的问题', null::text)
  $$,
  'the list does not present a pending answer placeholder as a grounded answer'
);

reset role;
set local role anon;

select throws_ok(
  $$ select * from public.list_recent_conversations() $$,
  '42501',
  'permission denied for function list_recent_conversations',
  'an anonymous visitor cannot review recent conversations'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  public.delete_admin_conversation(
    '00000000-0000-4000-8000-000000000401'
  ),
  '00000000-0000-4000-8000-000000000401'::uuid,
  'an administrator can delete one conversation in their organization'
);

select is(
  (
    select count(*)
    from public.conversations
    where id = '00000000-0000-4000-8000-000000000401'
  ),
  0::bigint,
  'the selected conversation is deleted'
);

select is(
  (
    select count(*)
    from public.messages
    where conversation_id = '00000000-0000-4000-8000-000000000401'
  ),
  0::bigint,
  'deleting a conversation cascades to its messages'
);

select is(
  (
    select count(*)
    from public.citations
    where conversation_id = '00000000-0000-4000-8000-000000000401'
  ),
  0::bigint,
  'deleting a conversation cascades to its citations'
);

select is(
  (
    select count(*)
    from public.quality_feedback
    where conversation_id = '00000000-0000-4000-8000-000000000401'
  ),
  0::bigint,
  'deleting a conversation cascades to its quality feedback'
);

select is(
  (
    select count(*)
    from public.unresolved_questions
    where conversation_id = '00000000-0000-4000-8000-000000000401'
  ),
  0::bigint,
  'deleting a conversation cascades to its unresolved questions'
);

select is(
  (
    select count(*)
    from public.conversations
    where id = '00000000-0000-4000-8000-000000000402'
  ),
  1::bigint,
  'deleting one conversation preserves another conversation'
);

select is(
  (
    select count(*)
    from public.messages
    where conversation_id = '00000000-0000-4000-8000-000000000402'
  ),
  2::bigint,
  'deleting one conversation preserves another conversation history'
);

select is(
  (
    select count(*)
    from public.knowledge_sources
    where id = '00000000-0000-4000-8000-000000000301'
  ),
  1::bigint,
  'deleting a conversation preserves knowledge sources'
);

select is(
  (
    select name
    from public.assistants
    where id = '00000000-0000-4000-8000-000000000201'
  ),
  '演示网站服务助手',
  'deleting a conversation preserves assistant configuration'
);

select throws_ok(
  $$
    select public.delete_admin_conversation(
      '00000000-0000-4000-8000-000000000404'
    )
  $$,
  'P0002',
  'conversation not found',
  'an administrator cannot delete another organization conversation'
);

reset role;
set local role anon;

select throws_ok(
  $$
    select public.delete_admin_conversation(
      '00000000-0000-4000-8000-000000000404'
    )
  $$,
  '42501',
  'permission denied for function delete_admin_conversation',
  'an anonymous visitor cannot delete a conversation'
);

select * from finish();
rollback;
