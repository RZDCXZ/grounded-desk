begin;

select plan(20);

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
  status
) values (
  '00000000-0000-4000-8000-000000000791',
  '00000000-0000-4000-8000-000000000101',
  '结果契约测试知识来源',
  'manual',
  'available'
);

create temporary table published_assistant as
select public_id
from public.assistants;

reset role;
grant select on published_assistant to service_role;
grant insert on public.citations to service_role;
grant insert on public.quality_feedback to service_role;
grant select on public.unresolved_questions to service_role;
grant select, update on public.messages to service_role;
set local role service_role;

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

select lives_ok(
  $$
    select public.complete_public_conversation(
      (select public_id from published_assistant),
      (select conversation_id from conversational_request),
      'conversational_response',
      '你好，我可以帮助你了解服务范围内的信息。',
      '[]'::jsonb
    )
  $$,
  'a conversational response is a legal explicit conversation result'
);

create temporary table clarification_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '退款',
  null,
  false,
  100,
  6,
  true
);

select lives_ok(
  $$
    select public.complete_public_conversation(
      (select public_id from published_assistant),
      (select conversation_id from clarification_request),
      'clarification_request',
      '关于“退款”，请补充你想了解的具体问题。',
      '[]'::jsonb
    )
  $$,
  'a clarification request is a legal explicit conversation result'
);

create temporary table cited_conversational_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '谢谢',
  null,
  false,
  100,
  6,
  false
);

select throws_ok(
  $$
    select public.complete_public_conversation(
      (select public_id from published_assistant),
      (select conversation_id from cited_conversational_request),
      'conversational_response',
      '不客气。',
      jsonb_build_array(
        jsonb_build_object(
          'knowledgeSourceId',
          '00000000-0000-4000-8000-000000000701'
        )
      )
    )
  $$,
  '22023',
  'only grounded answers may include citations',
  'a conversational response cannot accept citation input'
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
    )
    select
      organization_id,
      conversation_id,
      assistant_message_id,
      null,
      '不允许的引用',
      null
    from clarification_request
  $$,
  '23514',
  'citations require a completed grounded answer',
  'the database rejects a citation attached directly to a clarification request'
);

select throws_ok(
  $$
    select *
    from public.submit_public_quality_feedback(
      (select public_id from published_assistant),
      (select assistant_message_id from conversational_request),
      'helpful'
    )
  $$,
  '22023',
  'quality feedback target is invalid',
  'the public feedback contract rejects a conversational response'
);

select throws_ok(
  $$
    insert into public.quality_feedback (
      organization_id,
      conversation_id,
      answer_message_id,
      feedback_value
    )
    select
      organization_id,
      conversation_id,
      assistant_message_id,
      'helpful'
    from clarification_request
  $$,
  '23514',
  'quality feedback requires a completed grounded answer or refusal',
  'the database rejects feedback attached directly to a clarification request'
);

select is(
  (select count(*) from public.unresolved_questions),
  0::bigint,
  'conversational responses and clarification requests create no unresolved questions'
);

create temporary table cited_answer_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '有引用的事实问题'
);

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from cited_answer_request),
  'grounded_answer',
  '这是有据回答。',
  jsonb_build_array(
    jsonb_build_object(
      'knowledgeSourceId',
      '00000000-0000-4000-8000-000000000791'
    )
  )
);

select throws_ok(
  $$
    update public.messages
    set message_type = 'conversational_response'
    where id = (
      select assistant_message_id from cited_answer_request
    )
  $$,
  '23514',
  'only completed grounded answers may retain citations',
  'changing a cited answer cannot leave citations on a conversational response'
);

create temporary table feedback_refusal_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '会收到反馈的事实问题'
);

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from feedback_refusal_request),
  'grounded_refusal',
  '现有知识暂时无法确认。',
  '[]'::jsonb
);

select public.submit_public_quality_feedback(
  (select public_id from published_assistant),
  (select assistant_message_id from feedback_refusal_request),
  'helpful'
);

select throws_ok(
  $$
    update public.messages
    set message_type = 'clarification_request'
    where id = (
      select assistant_message_id from feedback_refusal_request
    )
  $$,
  '23514',
  'only completed grounded answers or refusals may retain quality feedback',
  'changing a reviewed refusal cannot leave feedback on a clarification request'
);

create temporary table contextual_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '多久到账？',
  (select conversation_id from clarification_request),
  false,
  100,
  6,
  true
);

select ok(
  (
    select
      context_messages @> jsonb_build_array(
        jsonb_build_object(
          'role',
          'visitor',
          'content',
          '退款',
          'resultType',
          null
        )
      )
      and context_messages @> jsonb_build_array(
        jsonb_build_object(
          'role',
          'assistant',
          'content',
          '关于“退款”，请补充你想了解的具体问题。',
          'resultType',
          'clarification_request'
        )
      )
    from contextual_request
  ),
  'recent context retains the visitor topic and explicit clarification result'
);

create temporary table free_request_after_budget as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '再见',
  null,
  false,
  1,
  6,
  false
);

select is(
  (select request_status from free_request_after_budget),
  'accepted',
  'a server-classified non-AI request remains available after the AI budget is exhausted'
);

create temporary table ai_request_after_budget as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '这个事实问题应受 AI 预算限制',
  null,
  false,
  1,
  6,
  true
);

select is(
  (select request_status from ai_request_after_budget),
  'daily_budget',
  'an in-progress AI request occupies the daily AI request budget'
);

create temporary table concurrent_free_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '免费路径也不能并发',
  (select conversation_id from free_request_after_budget),
  false,
  1,
  6,
  false
);

select is(
  (select request_status from concurrent_free_request),
  'answer_in_progress',
  'a non-AI request still respects the single in-progress response limit'
);

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from free_request_after_budget),
  'conversational_response',
  '再见，欢迎随时回来。',
  '[]'::jsonb
);

do $$
declare
  current_request record;
begin
  for message_number in 2..5 loop
    select *
    into current_request
    from public.begin_public_conversation(
      (select public_id from published_assistant),
      format('一分钟内的第 %s 条免费消息', message_number),
      (select conversation_id from free_request_after_budget),
      false,
      1,
      6,
      false
    );

    perform public.complete_public_conversation(
      (select public_id from published_assistant),
      current_request.conversation_id,
      'conversational_response',
      format('第 %s 条免费回应', message_number),
      '[]'::jsonb
    );
  end loop;
end;
$$;

create temporary table rate_limited_free_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '一分钟内的第六条免费消息',
  (select conversation_id from free_request_after_budget),
  false,
  1,
  6,
  false
);

select is(
  (select request_status from rate_limited_free_request),
  'rate_limited',
  'non-AI requests still respect the five-messages-per-minute limit'
);

create temporary table free_question_limit_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '免费消息 1',
  null,
  false,
  1,
  6,
  false
);

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from free_question_limit_request),
  'conversational_response',
  '免费回应 1',
  '[]'::jsonb
);

do $$
declare
  current_request record;
begin
  for message_number in 2..30 loop
    update public.messages
    set created_at = created_at - interval '2 minutes'
    where conversation_id = (
      select conversation_id from free_question_limit_request
    );

    select *
    into current_request
    from public.begin_public_conversation(
      (select public_id from published_assistant),
      format('免费消息 %s', message_number),
      (select conversation_id from free_question_limit_request),
      false,
      1,
      6,
      false
    );

    perform public.complete_public_conversation(
      (select public_id from published_assistant),
      current_request.conversation_id,
      'conversational_response',
      format('免费回应 %s', message_number),
      '[]'::jsonb
    );
  end loop;
end;
$$;

create temporary table question_limited_free_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '免费消息 31',
  (select conversation_id from free_question_limit_request),
  false,
  1,
  6,
  false
);

select is(
  (select request_status from question_limited_free_request),
  'question_limit',
  'non-AI requests still respect the thirty-message conversation limit'
);

grant select
on conversational_request, clarification_request
to authenticated;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select result_type
    from public.list_recent_conversations()
    where id in (
      (select conversation_id from conversational_request),
      (select conversation_id from clarification_request)
    )
    order by result_type
  $$,
  $$
    values
      ('clarification_request'),
      ('conversational_response')
  $$,
  'conversation review queries expose both new result types'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      (
        select consumes_ai_budget
        from public.messages
        where conversation_id = (
          select conversation_id from conversational_request
        )
          and message_type = 'visitor_question'
          and content = '你好'
      ),
      (
        select consumes_ai_budget
        from public.messages
        where conversation_id = (
          select conversation_id from clarification_request
        )
          and message_type = 'visitor_question'
          and content = '退款'
      )
    )
  $$,
  array['f|t'],
  'server AI classification is persisted for budget accounting'
);

select lives_ok(
  $$
    select public.delete_admin_conversation(
      (select conversation_id from clarification_request)
    )
  $$,
  'an administrator can delete a conversation ending in a clarification request'
);

select is(
  (
    select count(*)
    from public.messages
    where conversation_id = (
      select conversation_id from clarification_request
    )
  ),
  0::bigint,
  'deleting a conversation cascades through its clarification result'
);

select is(
  has_column_privilege(
    'authenticated',
    'public.messages',
    'consumes_ai_budget',
    'UPDATE'
  ),
  false,
  'authenticated clients cannot rewrite the server AI budget classification'
);

select * from finish();
rollback;
