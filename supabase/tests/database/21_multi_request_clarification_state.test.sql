begin;

select plan(8);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.publish_assistant();

insert into public.knowledge_sources (
  id, organization_id, title, source_type, status, original_url
) values (
  '00000000-0000-4000-8000-000000000799',
  '00000000-0000-4000-8000-000000000101',
  '退款说明',
  'manual',
  'available',
  'https://example.com/refund-state'
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
) values (
  '00000000-0000-4000-8000-000000000899',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000799',
  '退款说明',
  '审核通过后，退款会在两个工作日内到账。',
  'https://example.com/refund-state',
  'available',
  now()
);

update public.knowledge_sources
set current_revision_id =
  '00000000-0000-4000-8000-000000000899'
where id = '00000000-0000-4000-8000-000000000799';

insert into public.content_units (
  id,
  organization_id,
  knowledge_source_id,
  knowledge_revision_id,
  position,
  content,
  embedding
) values (
  '00000000-0000-4000-8000-000000000999',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000799',
  '00000000-0000-4000-8000-000000000899',
  0,
  '审核通过后，退款会在两个工作日内到账。',
  array_fill(0::real, array[1024])::extensions.vector
);

create temporary table published_assistant as
select public_id from public.assistants;

reset role;
grant select on published_assistant to service_role;
set local role service_role;

create function pg_temp.complete_partial_clarification(
  target_conversation_id uuid,
  target_round integer,
  target_outcome text,
  target_contact_url text default 'mailto:admin@groundeddesk.local',
  repeat_clarification boolean default false
)
returns uuid
language plpgsql
as $$
declare
  supported_id uuid := gen_random_uuid();
  incomplete_id uuid := gen_random_uuid();
begin
  return public.complete_public_multi_request_decision(
    (select public_id from published_assistant),
    target_conversation_id,
    'partially_grounded_answer',
    jsonb_build_array(
      jsonb_build_object(
        'id', supported_id,
        'order', 1,
        'title', '退款多久到账？',
        'status', 'supported',
        'content', '退款会在两个工作日内到账。',
        'citations', jsonb_build_array(
          jsonb_build_object(
            'knowledgeSourceId',
              '00000000-0000-4000-8000-000000000799',
            'title', '退款说明',
            'url', 'https://example.com/refund-state'
          )
        )
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'id', incomplete_id,
        'order', 2,
        'title', '发票',
        'status', case target_outcome
          when 'human_handoff' then 'handoff'
          else 'clarification'
        end,
        'content', case target_outcome
          when 'human_handoff'
            then '目前仍缺少：开票主体。请联系人工团队协助。'
          else case
            when repeat_clarification then '请补充：发票类型。'
            when target_round = 1 then '请补充：发票类型。'
            else '请补充：请明确发票的开票主体。'
          end
        end,
        'citations', '[]'::jsonb,
        'contact', case target_outcome
          when 'human_handoff' then jsonb_build_object(
            'label', '联系人工',
            'url', target_contact_url
          )
          else null
        end
      ))
    ),
    jsonb_build_object(
      'version', 'multi-request-decision-v1',
      'requestAnalysisVersion', 'request-analysis-v1',
      'responseStrategyVersion', 'multi-request-response-v1',
      'resultType', 'partially_grounded_answer',
      'requests', jsonb_build_array(
        jsonb_build_object(
          'factualRequest', jsonb_build_object(
            'id', supported_id,
            'order', 1,
            'originalText', '退款多久到账？',
            'normalizedQuestion', '退款多久到账？',
            'completeness', 'complete',
            'missingInformation', '[]'::jsonb,
            'clarificationRound', 0
          ),
          'outcome', 'supported',
          'coverage', jsonb_build_object(
            'version', 'evidence-coverage-v1',
            'factualRequestId', supported_id,
            'status', 'supported',
            'evidence', jsonb_build_array(
              jsonb_build_object(
                'contentUnitId',
                  '00000000-0000-4000-8000-000000000999',
                'knowledgeSourceId',
                  '00000000-0000-4000-8000-000000000799',
                'sourceTitle', '退款说明',
                'sourceUrl', 'https://example.com/refund-state',
                'relationship', 'supports',
                'exactExcerpt', '退款会在两个工作日内到账',
                'reason', '原文直接说明退款时效。'
              )
            )
          )
        ),
        jsonb_build_object(
          'factualRequest', jsonb_build_object(
            'id', incomplete_id,
            'order', 2,
            'originalText', '发票',
            'normalizedQuestion', '发票',
            'completeness', 'incomplete',
            'missingInformation', jsonb_build_array(
              case target_round
                when 1 then '发票类型'
                else '开票主体'
              end
            ),
            'clarificationRound', target_round
          ),
          'outcome', target_outcome
        )
      )
    )
  );
end;
$$;

create function pg_temp.complete_single_clarification(
  target_conversation_id uuid,
  target_round integer,
  target_outcome text
)
returns uuid
language plpgsql
as $$
declare
  request_id uuid := gen_random_uuid();
begin
  return public.complete_public_clarification_decision(
    (select public_id from published_assistant),
    target_conversation_id,
    target_outcome,
    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', request_id,
      'order', 1,
      'status', case target_outcome
        when 'human_handoff' then 'handoff'
        else 'clarification'
      end,
      'content', case target_outcome
        when 'human_handoff'
          then '目前仍缺少：开票主体。请联系人工团队协助。'
        else '请补充：请明确发票的开票主体。'
      end,
      'citations', '[]'::jsonb,
      'contact', case target_outcome
        when 'human_handoff' then jsonb_build_object(
          'label', '联系人工',
          'url', 'mailto:admin@groundeddesk.local'
        )
        else null
      end
    ))),
    jsonb_build_object(
      'factualRequest', jsonb_build_object(
        'id', request_id,
        'originalText', '发票',
        'normalizedQuestion', '发票',
        'missingInformation', jsonb_build_array('开票主体'),
        'clarificationRound', target_round,
        'requestAnalysisVersion', 'request-analysis-v1'
      ),
      'outcome', target_outcome,
      'responseStrategyVersion', 'clarification-handoff-v1'
    )
  );
end;
$$;

create temporary table first_exchange as
select *
from public.begin_public_conversation_with_clarification_state(
  (select public_id from published_assistant),
  '退款多久到账？发票',
  null,
  false,
  500,
  6,
  true
);

select lives_ok(
  $$
    select pg_temp.complete_partial_clarification(
      (select conversation_id from first_exchange),
      1,
      'clarification_request'
    )
  $$,
  'partial response persists the first per-request clarification'
);

create temporary table second_exchange as
select *
from public.begin_public_conversation_with_clarification_state(
  (select public_id from published_assistant),
  '电子发票',
  (select conversation_id from first_exchange),
  false,
  500,
  6,
  true
);

select is(
  (select clarification_states from second_exchange),
  jsonb_build_array(jsonb_build_object(
    'originalText', '发票',
    'round', 1,
    'latestClarification', '请补充：发票类型。'
  )),
  'the next turn restores clarification state from a partial response'
);

select throws_ok(
  $$
    select pg_temp.complete_partial_clarification(
      (select conversation_id from second_exchange),
      2,
      'clarification_request',
      'mailto:admin@groundeddesk.local',
      true
    )
  $$,
  '22023',
  'clarification round two requires round one',
  'round two cannot repeat the first clarification verbatim'
);

select lives_ok(
  $$
    select pg_temp.complete_single_clarification(
      (select conversation_id from second_exchange),
      2,
      'clarification_request'
    )
  $$,
  'round two is accepted only after the persisted first round'
);

create temporary table third_exchange as
select *
from public.begin_public_conversation_with_clarification_state(
  (select public_id from published_assistant),
  '还是不确定',
  (select conversation_id from second_exchange),
  false,
  500,
  6,
  true
);

select is(
  (select clarification_states from third_exchange),
  jsonb_build_array(jsonb_build_object(
    'originalText', '发票',
    'round', 2,
    'latestClarification', '请补充：请明确发票的开票主体。'
  )),
  'the second round remains bound to the same factual request'
);

select throws_ok(
  $$
    select pg_temp.complete_partial_clarification(
      (select conversation_id from third_exchange),
      2,
      'human_handoff',
      'https://attacker.example/contact'
    )
  $$,
  '22023',
  'incomplete multi request outcome is invalid',
  'a forged handoff contact is rejected'
);

select lives_ok(
  $$
    select pg_temp.complete_single_clarification(
      (select conversation_id from third_exchange),
      2,
      'human_handoff'
    )
  $$,
  'handoff is accepted after two persisted clarification rounds'
);

select is(
  public.get_public_latest_clarification_states(
    (select public_id from published_assistant),
    (select conversation_id from third_exchange)
  ),
  '[]'::jsonb,
  'a completed handoff does not reopen its clarification thread'
);

select * from finish();
rollback;
