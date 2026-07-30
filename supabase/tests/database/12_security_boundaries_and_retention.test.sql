begin;

select plan(20);

create temporary table protected_business_tables (
  table_name name primary key
);

insert into protected_business_tables (table_name)
values
  ('assistants'),
  ('knowledge_sources'),
  ('knowledge_revisions'),
  ('content_units'),
  ('conversations'),
  ('messages'),
  ('citations'),
  ('message_factual_requests'),
  ('evidence_snapshots'),
  ('quality_feedback'),
  ('unresolved_questions'),
  ('ai_call_logs');

grant select
on protected_business_tables
to anon, authenticated, service_role;

update public.assistants
set
  status = 'published',
  public_id = '00000000-0000-4000-8000-000000001201'
where id = '00000000-0000-4000-8000-000000000201';

insert into public.organizations (id, name, slug)
values (
  '00000000-0000-4000-8000-000000000102',
  '安全边界测试组织',
  'security-boundary-test'
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
  '其他组织助手',
  '其他组织欢迎语',
  '只能回答其他组织的服务范围。',
  'professional',
  '联系其他组织',
  'https://other.example/contact',
  'published',
  '00000000-0000-4000-8000-000000001202'
);

insert into public.knowledge_sources (
  id,
  organization_id,
  title,
  source_type,
  status,
  original_url
) values
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000101',
    '可信服务说明',
    'manual',
    'available',
    'https://example.com/trusted'
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000102',
    '其他组织服务说明',
    'manual',
    'available',
    'https://other.example/private'
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
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000401',
    '可信服务说明',
    '可信组织提供知识整理服务。',
    'https://example.com/trusted',
    'available',
    '2026-06-01 00:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000402',
    '其他组织服务说明',
    '其他组织的内部服务内容。',
    'https://other.example/private',
    'available',
    '2026-06-01 00:00:00+00'
  );

update public.knowledge_sources
set current_revision_id = case id
  when '00000000-0000-4000-8000-000000000401'
    then '00000000-0000-4000-8000-000000000801'::uuid
  else '00000000-0000-4000-8000-000000000802'::uuid
end
where id in (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000402'
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
    '00000000-0000-4000-8000-000000000901',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000801',
    0,
    '可信组织提供知识整理服务。',
    array_fill(0.01::real, array[1024])::extensions.vector(1024)
  ),
  (
    '00000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000802',
    0,
    '其他组织的内部内容单元。',
    array_fill(0.02::real, array[1024])::extensions.vector(1024)
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
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000601',
    '2026-06-30 11:59:00+00',
    '2026-06-30 11:59:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000602',
    '2026-06-01 00:00:00+00',
    '2026-06-30 12:01:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000603',
    '2026-07-30 00:00:00+00',
    '2026-07-30 00:00:00+00'
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
    '00000000-0000-4000-8000-000000000611',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000501',
    'visitor_question',
    '过期问题',
    'completed',
    '2026-06-30 11:59:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000612',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000501',
    'grounded_answer',
    '过期回答',
    'completed',
    '2026-06-30 11:59:01+00'
  ),
  (
    '00000000-0000-4000-8000-000000000621',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000502',
    'visitor_question',
    '保留期内问题',
    'completed',
    '2026-06-30 12:01:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000622',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000502',
    'grounded_answer',
    '',
    'pending',
    '2026-06-30 12:01:01+00'
  ),
  (
    '00000000-0000-4000-8000-000000000631',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000503',
    'visitor_question',
    '其他组织问题',
    'completed',
    '2026-07-30 00:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000632',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000503',
    'grounded_answer',
    '其他组织回答',
    'completed',
    '2026-07-30 00:00:01+00'
  );

insert into public.citations (
  id,
  organization_id,
  conversation_id,
  message_id,
  knowledge_source_id,
  source_title,
  source_url
) values
  (
    '00000000-0000-4000-8000-000000000711',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000612',
    '00000000-0000-4000-8000-000000000401',
    '可信服务说明',
    'https://example.com/trusted'
  ),
  (
    '00000000-0000-4000-8000-000000000731',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000632',
    '00000000-0000-4000-8000-000000000402',
    '其他组织服务说明',
    'https://other.example/private'
  );

insert into public.quality_feedback (
  id,
  organization_id,
  conversation_id,
  answer_message_id,
  feedback_value,
  created_at,
  updated_at
) values
  (
    '00000000-0000-4000-8000-000000000811',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000612',
    'helpful',
    '2026-06-30 11:59:02+00',
    '2026-06-30 11:59:02+00'
  ),
  (
    '00000000-0000-4000-8000-000000000831',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000632',
    'helpful',
    '2026-07-30 00:00:02+00',
    '2026-07-30 00:00:02+00'
  );

insert into public.unresolved_questions (
  id,
  organization_id,
  conversation_id,
  question_message_id,
  answer_message_id,
  question,
  answer_content,
  trigger_type,
  status,
  created_at
) values (
  '00000000-0000-4000-8000-000000000911',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000611',
  '00000000-0000-4000-8000-000000000612',
  '过期问题',
  '过期回答',
  'negative_feedback',
  'pending',
  '2026-06-30 11:59:03+00'
);

insert into public.ai_call_logs (
  id,
  organization_id,
  call_type,
  provider,
  model,
  input_tokens,
  output_tokens,
  total_tokens,
  duration_ms,
  outcome,
  error_type,
  trace_id,
  created_at
) values
  (
    '00000000-0000-4000-8000-000000000a11',
    '00000000-0000-4000-8000-000000000101',
    'answer',
    'test-provider',
    'test-model',
    10,
    5,
    15,
    20,
    'success',
    null,
    'expired-trace',
    '2026-06-30 11:59:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000a12',
    '00000000-0000-4000-8000-000000000101',
    'answer',
    'test-provider',
    'test-model',
    10,
    5,
    15,
    20,
    'success',
    null,
    'retained-trace',
    '2026-06-30 12:01:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000a13',
    '00000000-0000-4000-8000-000000000102',
    'answer',
    'test-provider',
    'test-model',
    10,
    5,
    15,
    20,
    'success',
    null,
    'other-organization-trace',
    '2026-07-30 00:00:00+00'
  );

select results_eq(
  $$
    select count(*)::integer
    from information_schema.columns as business_column
    join protected_business_tables as protected
      on protected.table_name = business_column.table_name
    where business_column.table_schema = 'public'
      and business_column.column_name = 'organization_id'
      and business_column.is_nullable = 'NO'
  $$,
  array[12],
  'every organization-owned business table requires an organization'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_class as business_table
    join pg_namespace as business_schema
      on business_schema.oid = business_table.relnamespace
    join protected_business_tables as protected
      on protected.table_name = business_table.relname
    where business_schema.nspname = 'public'
      and business_table.relrowsecurity
  $$,
  array[12],
  'every organization-owned business table has row level security'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_call_logs'
      and column_name in (
        'prompt',
        'request_body',
        'response_body',
        'answer',
        'api_key',
        'ip_address',
        'user_agent'
      )
  ),
  'AI call logs contain metadata only, without prompts, answers, keys, or IP profile fields'
);

select results_eq(
  $$
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'get_published_assistant',
        'begin_public_conversation',
        'complete_public_conversation',
        'complete_public_conversation_sections',
        'fail_public_conversation',
        'retrieve_public_assistant_content_units',
        'record_public_assistant_ai_call',
        'submit_public_quality_feedback'
      )
      and pg_get_function_identity_arguments(oid) ilike '%organization%'
  $$,
  array[0],
  'public assistant functions never accept a client-supplied organization'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.assistants
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.knowledge_sources
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.knowledge_revisions
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.content_units
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.conversations
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.messages
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.citations
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.quality_feedback
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.unresolved_questions
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.ai_call_logs
        where organization_id = '00000000-0000-4000-8000-000000000102')
    )
  $$,
  array['0|0|0|0|0|0|0|0|0|0'],
  'an organization administrator cannot read another organization across the complete model'
);

select is_empty(
  $$
    update public.assistants
    set name = '越权修改'
    where id = '00000000-0000-4000-8000-000000000202'
    returning id
  $$,
  'an organization administrator cannot update another organization assistant'
);

select throws_ok(
  $$
    insert into public.conversations (
      organization_id,
      assistant_id
    ) values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000202'
    )
  $$,
  '23503',
  null,
  'an organization administrator cannot link their conversation to another organization assistant'
);

select throws_ok(
  $$
    insert into public.citations (
      organization_id,
      conversation_id,
      message_id,
      knowledge_source_id,
      source_title,
      source_url
    ) values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000501',
      '00000000-0000-4000-8000-000000000612',
      '00000000-0000-4000-8000-000000000402',
      '伪造跨组织引用',
      'https://other.example/private'
    )
  $$,
  '23503',
  null,
  'an organization administrator cannot link a citation to another organization knowledge source'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.assistants),
      (select count(*) from public.knowledge_sources),
      (select count(*) from public.knowledge_revisions),
      (select count(*) from public.content_units),
      (select count(*) from public.conversations),
      (select count(*) from public.messages),
      (select count(*) from public.citations),
      (select count(*) from public.quality_feedback),
      (select count(*) from public.unresolved_questions),
      (select count(*) from public.ai_call_logs)
    )
  $$,
  array['0|0|0|0|0|0|0|0|0|0'],
  'an authenticated non-member cannot read any organization-owned business data'
);

reset role;
set local role anon;

select results_eq(
  $$
    select bool_and(
      not has_table_privilege(
        'anon',
        format('public.%I', protected_table.table_name),
        'SELECT'
      )
    )
    from protected_business_tables as protected_table
  $$,
  array[true],
  'the anonymous Data API role has no direct read grant on business tables'
);

reset role;
set local role service_role;

select results_eq(
  $$
    select request_status
    from public.begin_public_conversation(
      '00000000-0000-4000-8000-000000001201',
      '尝试接续其他助手会话',
      '00000000-0000-4000-8000-000000000503',
      false,
      500,
      6
    )
  $$,
  array['conversation_not_found'],
  'a published assistant rejects a conversation identifier owned by another assistant'
);

select throws_ok(
  $$
    select public.complete_public_conversation(
      '00000000-0000-4000-8000-000000001201',
      '00000000-0000-4000-8000-000000000503',
      'grounded_answer',
      '不应写入其他助手会话',
      '[]'::jsonb
    )
  $$,
  'P0002',
  'public conversation not found',
  'a published assistant cannot complete another assistant conversation'
);

select throws_ok(
  $$
    select *
    from public.submit_public_quality_feedback(
      '00000000-0000-4000-8000-000000001201',
      '00000000-0000-4000-8000-000000000632',
      'unhelpful'
    )
  $$,
  '22023',
  'quality feedback target is invalid',
  'a published assistant cannot attach feedback to another assistant answer'
);

select public.complete_public_conversation(
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000000502',
  'grounded_answer',
  '可信回答正文',
  jsonb_build_array(
    jsonb_build_object(
      'knowledgeSourceId',
      '00000000-0000-4000-8000-000000000401',
      'title',
      '模型伪造标题',
      'url',
      'https://attacker.example/forged'
    )
  )
);

reset role;

select results_eq(
  $$
    select concat_ws('|', source_title, source_url)
    from public.citations
    where message_id = '00000000-0000-4000-8000-000000000622'
  $$,
  array['可信服务说明|https://example.com/trusted'],
  'citation snapshots use server-owned source metadata instead of model-supplied titles or URLs'
);

insert into public.quality_feedback (
  id,
  organization_id,
  conversation_id,
  answer_message_id,
  feedback_value,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000821',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000622',
  'helpful',
  '2026-06-30 12:01:02+00',
  '2026-06-30 12:01:02+00'
);

insert into public.unresolved_questions (
  id,
  organization_id,
  conversation_id,
  question_message_id,
  answer_message_id,
  question,
  answer_content,
  trigger_type,
  status,
  created_at
) values (
  '00000000-0000-4000-8000-000000000921',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000502',
  '00000000-0000-4000-8000-000000000621',
  '00000000-0000-4000-8000-000000000622',
  '保留期内问题',
  '可信回答正文',
  'negative_feedback',
  'pending',
  '2026-06-30 12:01:03+00'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      deleted_conversations,
      deleted_ai_call_logs
    )
    from private.purge_expired_data('2026-07-30 12:00:00+00')
  $$,
  array['1|1'],
  'retention cleanup deletes conversations and metadata-only call logs older than thirty days'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.conversations
        where id = '00000000-0000-4000-8000-000000000501'),
      (select count(*) from public.messages
        where conversation_id = '00000000-0000-4000-8000-000000000501'),
      (select count(*) from public.citations
        where conversation_id = '00000000-0000-4000-8000-000000000501'),
      (select count(*) from public.quality_feedback
        where conversation_id = '00000000-0000-4000-8000-000000000501'),
      (select count(*) from public.unresolved_questions
        where conversation_id = '00000000-0000-4000-8000-000000000501'),
      (select count(*) from public.ai_call_logs
        where id = '00000000-0000-4000-8000-000000000a11')
    )
  $$,
  array['0|0|0|0|0|0'],
  'retention cleanup cascades through all data associated with an expired conversation'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.conversations
        where id = '00000000-0000-4000-8000-000000000502'),
      (select count(*) from public.messages
        where conversation_id = '00000000-0000-4000-8000-000000000502'),
      (select count(*) from public.citations
        where conversation_id = '00000000-0000-4000-8000-000000000502'),
      (select count(*) from public.quality_feedback
        where conversation_id = '00000000-0000-4000-8000-000000000502'),
      (select count(*) from public.unresolved_questions
        where conversation_id = '00000000-0000-4000-8000-000000000502'),
      (select count(*) from public.ai_call_logs
        where id = '00000000-0000-4000-8000-000000000a12')
    )
  $$,
  array['1|2|1|1|1|1'],
  'retention cleanup preserves recently active conversations even when they were created more than thirty days ago'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.conversations
        where organization_id = '00000000-0000-4000-8000-000000000102'),
      (select count(*) from public.ai_call_logs
        where organization_id = '00000000-0000-4000-8000-000000000102')
    )
  $$,
  array['1|1'],
  'retention cleanup preserves non-expired data in every organization'
);

select results_eq(
  $$
    select concat_ws('|', schedule, command, active)
    from cron.job
    where jobname = 'grounded-desk-daily-retention'
  $$,
  array[
    '15 3 * * *|select private.purge_expired_data();|t'
  ],
  'a named active job runs retention cleanup every day'
);

select results_eq(
  $$
    select has_function_privilege(
      'authenticated',
      'private.purge_expired_data(timestamptz)',
      'EXECUTE'
    )
  $$,
  array[false],
  'retention cleanup cannot be invoked by application users'
);

select * from finish();
rollback;
