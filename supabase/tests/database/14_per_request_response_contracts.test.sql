begin;

select plan(20);

update public.assistants
set
  status = 'published',
  public_id = '00000000-0000-4000-8000-000000001201'
where id = '00000000-0000-4000-8000-000000000201';

insert into public.organizations (id, name, slug)
values (
  '00000000-0000-4000-8000-000000000102',
  '逐项契约其他组织',
  'per-request-contract-other'
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
  '欢迎',
  '其他组织服务',
  'professional',
  '联系人工',
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
    '00000000-0000-4000-8000-000000000491',
    '00000000-0000-4000-8000-000000000101',
    '逐项契约来源',
    'manual',
    'available',
    'https://example.com/per-request'
  ),
  (
    '00000000-0000-4000-8000-000000000492',
    '00000000-0000-4000-8000-000000000102',
    '其他组织来源',
    'manual',
    'available',
    'https://other.example/per-request'
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
    '00000000-0000-4000-8000-000000000891',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000491',
    '逐项契约来源',
    '标准版服务在两个工作日内完成。',
    'https://example.com/per-request',
    'available',
    now()
  ),
  (
    '00000000-0000-4000-8000-000000000892',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000492',
    '其他组织来源',
    '其他组织内容。',
    'https://other.example/per-request',
    'available',
    now()
  );

update public.knowledge_sources
set current_revision_id = case id
  when '00000000-0000-4000-8000-000000000491'
    then '00000000-0000-4000-8000-000000000891'::uuid
  else '00000000-0000-4000-8000-000000000892'::uuid
end
where id in (
  '00000000-0000-4000-8000-000000000491',
  '00000000-0000-4000-8000-000000000492'
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
    '00000000-0000-4000-8000-000000000991',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000491',
    '00000000-0000-4000-8000-000000000891',
    0,
    '标准版服务在两个工作日内完成。',
    array_fill(0::real, array[1024])::extensions.vector
  ),
  (
    '00000000-0000-4000-8000-000000000992',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000492',
    '00000000-0000-4000-8000-000000000892',
    0,
    '其他组织内容。',
    array_fill(0::real, array[1024])::extensions.vector
  );

insert into public.conversations (
  id,
  organization_id,
  assistant_id
) values
  (
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201'
  ),
  (
    '00000000-0000-4000-8000-000000000692',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000202'
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
    '00000000-0000-4000-8000-000000000591',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    'visitor_question',
    '服务时效、价格和退款条件是什么？',
    'completed'
  ),
  (
    '00000000-0000-4000-8000-000000000592',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    'partially_grounded_answer',
    '时效已有依据，价格暂无支持，退款条件存在冲突。',
    'completed'
  ),
  (
    '00000000-0000-4000-8000-000000000593',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000692',
    'visitor_question',
    '其他组织问题',
    'completed'
  ),
  (
    '00000000-0000-4000-8000-000000000594',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000692',
    'knowledge_conflict',
    '其他组织知识存在冲突。',
    'completed'
  ),
  (
    '00000000-0000-4000-8000-000000000595',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    'visitor_question',
    '另一个问题',
    'completed'
  ),
  (
    '00000000-0000-4000-8000-000000000596',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    'grounded_answer',
    '另一个有据回答。',
    'completed'
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
  missing_information,
  clarification_round,
  request_analysis_version,
  response_strategy_version
) values
  (
    '00000000-0000-4000-8000-000000001591',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000591',
    '00000000-0000-4000-8000-000000000592',
    1,
    '服务时效是什么？',
    '标准版服务时效是什么？',
    'complete',
    'supported',
    '[]'::jsonb,
    0,
    'request-analysis-v1',
    'response-decision-v1'
  ),
  (
    '00000000-0000-4000-8000-000000001592',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000591',
    '00000000-0000-4000-8000-000000000592',
    2,
    '价格是什么？',
    '标准版服务价格是什么？',
    'complete',
    'unsupported',
    '[]'::jsonb,
    0,
    'request-analysis-v1',
    'response-decision-v1'
  ),
  (
    '00000000-0000-4000-8000-000000001593',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000591',
    '00000000-0000-4000-8000-000000000592',
    3,
    '退款条件是什么？',
    '标准版服务退款条件是什么？',
    'complete',
    'conflicting',
    '[]'::jsonb,
    0,
    'request-analysis-v1',
    'response-decision-v1'
  ),
  (
    '00000000-0000-4000-8000-000000001594',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000595',
    '00000000-0000-4000-8000-000000000596',
    1,
    '另一个问题',
    '另一个问题是什么？',
    'complete',
    'supported',
    '[]'::jsonb,
    0,
    'request-analysis-v1',
    'response-decision-v1'
  ),
  (
    '00000000-0000-4000-8000-000000001595',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000692',
    '00000000-0000-4000-8000-000000000593',
    '00000000-0000-4000-8000-000000000594',
    1,
    '其他组织问题',
    '其他组织问题',
    'complete',
    'conflicting',
    '[]'::jsonb,
    0,
    'request-analysis-v1',
    'response-decision-v1'
  );

select is(
  (
    select string_agg(
      concat_ws(':', request_order, completeness, coverage_status),
      ',' order by request_order
    )
    from public.message_factual_requests
    where assistant_message_id =
      '00000000-0000-4000-8000-000000000592'
  ),
  '1:complete:supported,2:complete:unsupported,3:complete:conflicting',
  'one assistant message stores at most three ordered factual requests'
);

select throws_ok(
  $$
    insert into public.message_factual_requests (
      organization_id,
      conversation_id,
      visitor_message_id,
      assistant_message_id,
      request_order,
      original_text,
      normalized_question,
      completeness,
      missing_information,
      clarification_round,
      request_analysis_version,
      response_strategy_version
    ) values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000691',
      '00000000-0000-4000-8000-000000000591',
      '00000000-0000-4000-8000-000000000592',
      4,
      '第四项',
      '第四项是什么？',
      'incomplete',
      '["具体对象"]'::jsonb,
      1,
      'request-analysis-v1',
      'response-decision-v1'
    )
  $$,
  '23514',
  null,
  'a message cannot store a fourth factual request'
);

select throws_ok(
  $$
    insert into public.message_factual_requests (
      organization_id,
      conversation_id,
      visitor_message_id,
      assistant_message_id,
      request_order,
      original_text,
      normalized_question,
      completeness,
      coverage_status,
      missing_information,
      clarification_round,
      request_analysis_version,
      response_strategy_version
    ) values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000691',
      '00000000-0000-4000-8000-000000000593',
      '00000000-0000-4000-8000-000000000592',
      1,
      '跨组织问题',
      '跨组织问题',
      'complete',
      'unsupported',
      '[]'::jsonb,
      0,
      'request-analysis-v1',
      'response-decision-v1'
    )
  $$,
  '23514',
  'factual request visitor message must be a completed visitor question',
  'factual requests cannot cross organization boundaries'
);

insert into public.citations (
  organization_id,
  conversation_id,
  message_id,
  factual_request_id,
  knowledge_source_id,
  source_title,
  source_url
) values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000592',
    null,
    '00000000-0000-4000-8000-000000000491',
    '历史消息级引用',
    'https://example.com/legacy'
  ),
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000592',
    '00000000-0000-4000-8000-000000001591',
    '00000000-0000-4000-8000-000000000491',
    '逐项契约来源',
    'https://example.com/per-request'
  );

select is(
  (
    select count(*)
    from public.citations
    where message_id = '00000000-0000-4000-8000-000000000592'
      and factual_request_id is null
  ),
  1::bigint,
  'historical message-level citations remain readable'
);

select is(
  (
    select factual_request_id
    from public.citations
    where source_title = '逐项契约来源'
  ),
  '00000000-0000-4000-8000-000000001591'::uuid,
  'a citation can be associated with one factual request'
);

select throws_ok(
  $$
    update public.citations
    set factual_request_id =
      '00000000-0000-4000-8000-000000001594'
    where source_title = '逐项契约来源'
  $$,
  '23514',
  'citation factual request must belong to the same message',
  'a citation cannot point at a factual request from another response section'
);

insert into public.evidence_snapshots (
  organization_id,
  conversation_id,
  factual_request_id,
  content_unit_id,
  knowledge_source_id,
  source_title,
  source_url,
  relationship,
  exact_excerpt,
  decision_reason,
  coverage_decision_version
) values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000001591',
    '00000000-0000-4000-8000-000000000991',
    '00000000-0000-4000-8000-000000000491',
    '逐项契约来源',
    'https://example.com/per-request',
    'supports',
    '两个工作日内完成',
    '原文直接说明服务时效。',
    'coverage-decision-v1'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000692',
    '00000000-0000-4000-8000-000000001595',
    '00000000-0000-4000-8000-000000000992',
    '00000000-0000-4000-8000-000000000492',
    '其他组织来源',
    'https://other.example/per-request',
    'conflicts',
    '其他组织内容',
    '其他组织判定。',
    'coverage-decision-v1'
  );

select results_eq(
  $$
    select
      relationship,
      exact_excerpt,
      decision_reason,
      coverage_decision_version
    from public.evidence_snapshots
    where organization_id =
      '00000000-0000-4000-8000-000000000101'
  $$,
  $$
    values (
      'supports',
      '两个工作日内完成',
      '原文直接说明服务时效。',
      'coverage-decision-v1'
    )
  $$,
  'an evidence snapshot stores the bounded excerpt and audit metadata'
);

select throws_ok(
  $$
    insert into public.evidence_snapshots (
      organization_id,
      conversation_id,
      factual_request_id,
      content_unit_id,
      knowledge_source_id,
      source_title,
      relationship,
      exact_excerpt,
      decision_reason,
      coverage_decision_version
    ) values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000691',
      '00000000-0000-4000-8000-000000001591',
      '00000000-0000-4000-8000-000000000992',
      '00000000-0000-4000-8000-000000000492',
      '伪造跨组织来源',
      'supports',
      '其他组织内容',
      '不允许跨组织。',
      'coverage-decision-v1'
    )
  $$,
  '23514',
  'evidence content unit must be an organization candidate',
  'evidence snapshots reject content units from another organization'
);

insert into public.unresolved_questions (
  organization_id,
  conversation_id,
  question_message_id,
  answer_message_id,
  factual_request_id,
  question,
  answer_content,
  trigger_type,
  status
) values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000591',
    '00000000-0000-4000-8000-000000000592',
    '00000000-0000-4000-8000-000000001592',
    '价格是什么？',
    '价格暂无支持。',
    'unsupported_factual_request',
    'pending'
  ),
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000691',
    '00000000-0000-4000-8000-000000000591',
    '00000000-0000-4000-8000-000000000592',
    '00000000-0000-4000-8000-000000001593',
    '退款条件是什么？',
    '退款条件存在冲突。',
    'knowledge_conflict',
    'pending'
  );

set local role service_role;

select public.submit_public_quality_feedback(
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000000592',
  'unhelpful'
);

select public.submit_public_quality_feedback(
  '00000000-0000-4000-8000-000000001201',
  '00000000-0000-4000-8000-000000000592',
  'unhelpful'
);

reset role;

select results_eq(
  $$
    select concat_ws(
      '|',
      (
        select count(*)
        from public.quality_feedback
        where answer_message_id =
          '00000000-0000-4000-8000-000000000592'
      ),
      (
        select count(*)
        from public.unresolved_questions
        where answer_message_id =
          '00000000-0000-4000-8000-000000000592'
      )
    )
  $$,
  array['1|3'],
  'request-level gaps coexist with message-level negative feedback'
);

select throws_ok(
  $$
    insert into public.unresolved_questions (
      organization_id,
      conversation_id,
      question_message_id,
      answer_message_id,
      factual_request_id,
      question,
      answer_content,
      trigger_type,
      status
    ) values (
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000691',
      '00000000-0000-4000-8000-000000000591',
      '00000000-0000-4000-8000-000000000592',
      '00000000-0000-4000-8000-000000001592',
      '价格是什么？',
      '重复价格缺口。',
      'unsupported_factual_request',
      'pending'
    )
  $$,
  '23505',
  null,
  'the same message, factual request and trigger cannot create duplicates'
);

select lives_ok(
  $$
    insert into public.messages (
      organization_id,
      conversation_id,
      message_type,
      content,
      status
    ) values
      (
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000691',
        'human_handoff',
        '请联系人工继续处理。',
        'completed'
      ),
      (
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000691',
        'knowledge_conflict',
        '现有知识存在冲突。',
        'completed'
      )
  $$,
  'new result types are legal before their public behavior is enabled'
);

select throws_ok(
  $$
    update public.message_factual_requests
    set clarification_round = 3
    where id = '00000000-0000-4000-8000-000000001591'
  $$,
  '23514',
  null,
  'clarification rounds are bounded at two'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.message_factual_requests),
  4::bigint,
  'members can read factual requests only in their organization'
);

select is(
  (select count(*) from public.evidence_snapshots),
  1::bigint,
  'members can read evidence snapshots only in their organization'
);

reset role;

select is(
  has_table_privilege(
    'anon',
    'public.message_factual_requests',
    'SELECT'
  ),
  false,
  'anonymous clients cannot read factual request audit data'
);

select is(
  has_table_privilege(
    'anon',
    'public.evidence_snapshots',
    'SELECT'
  ),
  false,
  'anonymous clients cannot read evidence snapshots'
);

delete from public.knowledge_sources
where id = '00000000-0000-4000-8000-000000000491';

select results_eq(
  $$
    select
      content_unit_id,
      knowledge_source_id,
      source_title,
      source_url,
      exact_excerpt
    from public.evidence_snapshots
    where organization_id =
      '00000000-0000-4000-8000-000000000101'
  $$,
  $$
    values (
      '00000000-0000-4000-8000-000000000991'::uuid,
      '00000000-0000-4000-8000-000000000491'::uuid,
      '逐项契约来源',
      'https://example.com/per-request',
      '两个工作日内完成'
    )
  $$,
  'source updates or deletion do not rewrite evidence identity snapshots'
);

delete from public.conversations
where id = '00000000-0000-4000-8000-000000000691';

select is(
  (
    select count(*)
    from public.message_factual_requests
    where conversation_id =
      '00000000-0000-4000-8000-000000000691'
  ),
  0::bigint,
  'deleting a conversation cascades through factual requests'
);

select is(
  (
    select count(*)
    from public.evidence_snapshots
    where conversation_id =
      '00000000-0000-4000-8000-000000000691'
  ),
  0::bigint,
  'deleting a conversation cascades through evidence snapshots'
);

select is(
  (
    select count(*)
    from public.unresolved_questions
    where conversation_id =
      '00000000-0000-4000-8000-000000000691'
  ),
  0::bigint,
  'deleting a conversation cascades through all request-level issues'
);

select * from finish();
rollback;
