begin;

select plan(17);

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

grant select on published_assistant to service_role;
grant select, insert, update, delete
on public.conversations, public.messages
to service_role;

set local role service_role;

create temporary table accepted_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '你们提供什么服务？',
  null,
  false,
  100,
  6
);

select is(
  (select request_status from accepted_request),
  'accepted',
  'first question starts a new conversation'
);

select is(
  (select context_messages from accepted_request),
  '[]'::jsonb,
  'a new conversation has no inherited context'
);

select is(
  (select question_count from accepted_request),
  1,
  'the first accepted question starts the question count'
);

create temporary table concurrent_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '并发问题不应被接受',
  (select conversation_id from accepted_request),
  false,
  100,
  6
);

select is(
  (select request_status from concurrent_request),
  'answer_in_progress',
  'a conversation allows only one pending answer'
);

select is(
  (
    select count(*)::integer
    from public.messages
    where conversation_id = (
      select conversation_id from accepted_request
    )
  ),
  2,
  'a rejected concurrent request does not create messages'
);

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from accepted_request),
  'grounded_answer',
  '我们提供知识整理服务。',
  '[]'::jsonb
);

do $$
declare
  current_request record;
begin
  for question_number in 2..5 loop
    select *
    into current_request
    from public.begin_public_conversation(
      (select public_id from published_assistant),
      format('第 %s 个问题', question_number),
      (select conversation_id from accepted_request),
      false,
      100,
      6
    );

    perform public.complete_public_conversation(
      (select public_id from published_assistant),
      current_request.conversation_id,
      'grounded_answer',
      format('第 %s 个回答', question_number),
      '[]'::jsonb
    );
  end loop;
end;
$$;

create temporary table rate_limited_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '一分钟内的第六个问题',
  (select conversation_id from accepted_request),
  false,
  100,
  6
);

select is(
  (select request_status from rate_limited_request),
  'rate_limited',
  'a conversation accepts at most five visitor messages per minute'
);

update public.messages
set created_at = created_at - interval '2 minutes'
where conversation_id = (select conversation_id from accepted_request);

create temporary table follow_up_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '它包含实施支持吗？',
  (select conversation_id from accepted_request),
  false,
  100,
  6
);

select is(
  (select request_status from follow_up_request),
  'accepted',
  'the conversation accepts a follow-up after the rate window'
);

select is(
  (select jsonb_array_length(context_messages) from follow_up_request),
  6,
  'only the configured number of recent messages becomes context'
);

select is(
  (
    select context_messages -> 0 ->> 'content'
    from follow_up_request
  ),
  '第 3 个问题',
  'limited context keeps the newest complete exchanges in order'
);

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from follow_up_request),
  'grounded_answer',
  '根据知识来源，包含实施支持。',
  '[]'::jsonb
);

create temporary table isolated_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '新会话中的问题',
  null,
  false,
  100,
  6
);

select is(
  (select context_messages from isolated_request),
  '[]'::jsonb,
  'a new conversation does not inherit another conversation context'
);

select isnt(
  (select conversation_id from isolated_request),
  (select conversation_id from accepted_request),
  'a new conversation receives a distinct anonymous identifier'
);

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from isolated_request),
  'grounded_answer',
  '新会话回答。',
  '[]'::jsonb
);

create temporary table failed_retry_question as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '保留并重试这个问题',
  (select conversation_id from isolated_request),
  false,
  100,
  6
);

select public.fail_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from failed_retry_question)
);

create temporary table retried_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '保留并重试这个问题',
  (select conversation_id from isolated_request),
  true,
  100,
  6
);

select is(
  (select request_status from retried_request),
  'accepted',
  'a technical failure can retry the saved visitor question'
);

select is(
  (select question_count from retried_request),
  2,
  'retrying does not increase the conversation question count'
);

select is(
  (
    select count(*)::integer
    from public.messages
    where conversation_id = (
      select conversation_id from isolated_request
    )
      and message_type = 'visitor_question'
  ),
  2,
  'retrying does not insert a duplicate visitor question'
);

select public.complete_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from retried_request),
  'grounded_answer',
  '重试后的回答。',
  '[]'::jsonb
);

delete from public.messages
where conversation_id = (select conversation_id from accepted_request);

insert into public.messages (
  organization_id,
  conversation_id,
  message_type,
  content,
  status,
  created_at
)
select
  (select organization_id from accepted_request),
  (select conversation_id from accepted_request),
  message.message_type,
  message.content,
  'completed',
  now() - interval '2 minutes'
from generate_series(1, 30) as question(number)
cross join lateral (
  values
    ('visitor_question', format('历史问题 %s', question.number)),
    ('grounded_answer', format('历史回答 %s', question.number))
) as message(message_type, content);

create temporary table question_limited_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '第三十一个问题',
  (select conversation_id from accepted_request),
  false,
  100,
  6
);

select is(
  (select request_status from question_limited_request),
  'question_limit',
  'a conversation accepts no more than thirty questions'
);

create temporary table budget_limited_request as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '超过全局每日预算的问题',
  null,
  false,
  1,
  6
);

select is(
  (select request_status from budget_limited_request),
  'daily_budget',
  'the global daily message budget stops a new model request'
);

select is(
  (
    select count(*)::integer
    from public.conversations
    where id not in (
      select conversation_id from accepted_request
      union all
      select conversation_id from isolated_request
    )
  ),
  0,
  'a daily-budget rejection does not create an empty conversation'
);

select * from finish();
rollback;
