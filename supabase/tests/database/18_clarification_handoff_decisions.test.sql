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
select public_id from public.assistants;

reset role;
grant select on published_assistant to service_role;
grant select on public.message_factual_requests to service_role;
grant select on public.citations to service_role;
grant select on public.quality_feedback to service_role;
grant select on public.unresolved_questions to service_role;
grant select on public.messages to service_role;
set local role service_role;

create temporary table first_round as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '退款'
);

select lives_ok(
  $$
    select public.complete_public_clarification_decision(
      (select public_id from published_assistant),
      (select conversation_id from first_round),
      'clarification_request',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001801',
          'order', 1,
          'status', 'clarification',
          'content', '关于退款，您想了解哪一方面？',
          'citations', '[]'::jsonb
        )
      ),
      jsonb_build_object(
        'factualRequest', jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001801',
          'originalText', '退款',
          'normalizedQuestion', '退款',
          'missingInformation', jsonb_build_array('想了解的具体方面'),
          'clarificationRound', 1,
          'requestAnalysisVersion', 'request-analysis-v1'
        ),
        'outcome', 'clarification_request',
        'responseStrategyVersion', 'clarification-handoff-v1'
      )
    )
  $$,
  'the first incomplete request persists as clarification round one'
);

select results_eq(
  $$
    select
      completeness,
      coverage_status,
      missing_information,
      clarification_round,
      response_strategy_version
    from public.message_factual_requests
    where id = '00000000-0000-4000-8000-000000001801'
  $$,
  $$
    values (
      'incomplete',
      null::text,
      jsonb_build_array('想了解的具体方面'),
      1::smallint,
      'clarification-handoff-v1'
    )
  $$,
  'round one stores concrete missing information without coverage'
);

select results_eq(
  $$
    select
      original_text,
      clarification_round,
      clarification_content
    from public.get_public_latest_clarification_state(
      (select public_id from published_assistant),
      (select conversation_id from first_round)
    )
  $$,
  $$
    values (
      '退款',
      1::smallint,
      '关于退款，您想了解哪一方面？'
    )
  $$,
  'the public route can restore the latest stable clarification identity'
);

create temporary table failed_follow_up as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '到账',
  (select conversation_id from first_round)
);

select public.fail_public_conversation(
  (select public_id from published_assistant),
  (select conversation_id from failed_follow_up)
);

select results_eq(
  $$
    select original_text, clarification_round
    from public.get_public_latest_clarification_state(
      (select public_id from published_assistant),
      (select conversation_id from first_round)
    )
  $$,
  $$ values ('退款', 1::smallint) $$,
  'a technical failure does not clear the pending clarification state'
);

create temporary table second_round as
select *
from public.begin_public_conversation_with_clarification_state(
  (select public_id from published_assistant),
  '到账',
  (select conversation_id from first_round),
  true
);

select is(
  (
    select context_messages -> 1 ->> 'resultType'
    from second_round
  ),
  'clarification_request',
  'the next turn receives the first controlled clarification as context'
);

select results_eq(
  $$
    select
      clarification_original_text,
      clarification_round,
      clarification_content
    from second_round
  $$,
  $$
    values (
      '退款',
      1::smallint,
      '关于退款，您想了解哪一方面？'
    )
  $$,
  'the transactional begin contract restores state during a retry'
);

select public.complete_public_clarification_decision(
  (select public_id from published_assistant),
  (select conversation_id from second_round),
  'clarification_request',
  jsonb_build_array(
    jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000001802',
      'order', 1,
      'status', 'clarification',
      'content', '您想了解哪一笔退款的预计到账时间？',
      'citations', '[]'::jsonb
    )
  ),
  jsonb_build_object(
    'factualRequest', jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000001802',
      'originalText', '退款',
      'normalizedQuestion', '退款到账时间',
      'missingInformation', jsonb_build_array('需要确认的退款记录'),
      'clarificationRound', 2,
      'requestAnalysisVersion', 'request-analysis-v1'
    ),
    'outcome', 'clarification_request',
    'responseStrategyVersion', 'clarification-handoff-v1'
  )
);

select results_eq(
  $$
    select original_text, normalized_question, clarification_round
    from public.message_factual_requests
    where id = '00000000-0000-4000-8000-000000001802'
  $$,
  $$
    values ('退款', '退款到账时间', 2::smallint)
  $$,
  'round two keeps the root intent while incorporating new context'
);

create temporary table handoff_round as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '不知道',
  (select conversation_id from first_round)
);

select lives_ok(
  $$
    select public.complete_public_clarification_decision(
      (select public_id from published_assistant),
      (select conversation_id from handoff_round),
      'human_handoff',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001803',
          'order', 1,
          'status', 'handoff',
          'content', '目前仍缺少：需要确认的退款记录。请联系人工团队协助。',
          'citations', '[]'::jsonb,
          'contact', jsonb_build_object(
            'label', '联系人工',
            'url', 'mailto:admin@groundeddesk.local'
          )
        )
      ),
      jsonb_build_object(
        'factualRequest', jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001803',
          'originalText', '退款',
          'normalizedQuestion', '退款到账时间',
          'missingInformation', jsonb_build_array('需要确认的退款记录'),
          'clarificationRound', 2,
          'requestAnalysisVersion', 'request-analysis-v1'
        ),
        'outcome', 'human_handoff',
        'responseStrategyVersion', 'clarification-handoff-v1'
      )
    )
  $$,
  'a still-incomplete request after two rounds becomes human handoff'
);

select results_eq(
  $$
    select message_type, status
    from public.messages
    where id = (select assistant_message_id from handoff_round)
  $$,
  $$ values ('human_handoff', 'completed') $$,
  'human handoff remains a distinct completed result'
);

select results_eq(
  $$
    select completeness, clarification_round, coverage_status
    from public.message_factual_requests
    where id = '00000000-0000-4000-8000-000000001803'
  $$,
  $$ values ('incomplete', 2::smallint, null::text) $$,
  'handoff remains an incomplete request rather than a refusal'
);

select is(
  (
    select count(*)
    from public.get_public_latest_clarification_state(
      (select public_id from published_assistant),
      (select conversation_id from handoff_round)
    )
  ),
  0::bigint,
  'a terminal handoff clears the latest clarification state'
);

select is(
  (
    select
      count(citation.id)
      + count(feedback.id)
      + count(unresolved.id)
    from public.messages as message
    left join public.citations as citation
      on citation.message_id = message.id
    left join public.quality_feedback as feedback
      on feedback.answer_message_id = message.id
    left join public.unresolved_questions as unresolved
      on unresolved.answer_message_id = message.id
    where message.conversation_id =
      (select conversation_id from handoff_round)
      and message.message_type in (
        'clarification_request',
        'human_handoff'
      )
  ),
  0::bigint,
  'clarification and handoff create no citation feedback or unresolved item'
);

create temporary table invalid_round as
select *
from public.begin_public_conversation(
  (select public_id from published_assistant),
  '配送'
);

select throws_ok(
  $$
    select public.complete_public_clarification_decision(
      (select public_id from published_assistant),
      (select conversation_id from invalid_round),
      'human_handoff',
      jsonb_build_array(
        jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001804',
          'order', 1,
          'status', 'handoff',
          'content', '请联系人工。',
          'citations', '[]'::jsonb,
          'contact', jsonb_build_object(
            'label', '联系人工',
            'url', 'mailto:admin@groundeddesk.local'
          )
        )
      ),
      jsonb_build_object(
        'factualRequest', jsonb_build_object(
          'id', '00000000-0000-4000-8000-000000001804',
          'originalText', '配送',
          'normalizedQuestion', '配送',
          'missingInformation', jsonb_build_array('配送目的地'),
          'clarificationRound', 1,
          'requestAnalysisVersion', 'request-analysis-v1'
        ),
        'outcome', 'human_handoff',
        'responseStrategyVersion', 'clarification-handoff-v1'
      )
    )
  $$,
  '22023',
  'clarification section does not match the decision'
);

select results_eq(
  $$
    select status, message_type
    from public.messages
    where id = (select assistant_message_id from invalid_round)
  $$,
  $$ values ('pending', 'grounded_answer') $$,
  'invalid decision validation leaves the pending result unchanged'
);

select is(
  (
    select count(*)
    from public.message_factual_requests
    where id = '00000000-0000-4000-8000-000000001804'
  ),
  0::bigint,
  'invalid decisions leave no factual-request audit record'
);

select * from finish();
rollback;
