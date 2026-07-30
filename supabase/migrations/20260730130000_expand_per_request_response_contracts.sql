alter table public.messages
drop constraint messages_message_type_check;

alter table public.messages
add constraint messages_message_type_check
check (
  message_type in (
    'visitor_question',
    'answer_retry',
    'grounded_answer',
    'partially_grounded_answer',
    'knowledge_conflict',
    'grounded_refusal',
    'conversational_response',
    'clarification_request',
    'human_handoff',
    'technical_failure'
  )
);

create table public.message_factual_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  conversation_id uuid not null,
  visitor_message_id uuid not null,
  assistant_message_id uuid not null,
  request_order smallint not null
    check (request_order between 1 and 3),
  original_text text not null
    check (char_length(btrim(original_text)) between 1 and 2000),
  normalized_question text not null
    check (char_length(btrim(normalized_question)) between 1 and 2000),
  completeness text not null
    check (completeness in ('complete', 'incomplete')),
  coverage_status text
    check (
      coverage_status is null
      or coverage_status in ('supported', 'unsupported', 'conflicting')
    ),
  missing_information jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(missing_information) = 'array'
      and jsonb_array_length(missing_information) <= 10
    ),
  clarification_round smallint not null default 0
    check (clarification_round between 0 and 2),
  request_analysis_version text not null
    check (
      char_length(btrim(request_analysis_version)) between 1 and 120
    ),
  response_strategy_version text not null
    check (
      char_length(btrim(response_strategy_version)) between 1 and 120
    ),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (assistant_message_id, request_order),
  foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete cascade,
  foreign key (visitor_message_id, organization_id)
    references public.messages(id, organization_id)
    on delete cascade,
  foreign key (assistant_message_id, organization_id)
    references public.messages(id, organization_id)
    on delete cascade,
  check (
    (
      completeness = 'complete'
      and jsonb_array_length(missing_information) = 0
    )
    or (
      completeness = 'incomplete'
      and coverage_status is null
      and jsonb_array_length(missing_information) > 0
    )
  )
);

create index message_factual_requests_conversation_order_idx
on public.message_factual_requests(
  conversation_id,
  assistant_message_id,
  request_order
);

create function private.enforce_factual_request_messages()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages as visitor
    where visitor.id = new.visitor_message_id
      and visitor.organization_id = new.organization_id
      and visitor.conversation_id = new.conversation_id
      and visitor.message_type = 'visitor_question'
      and visitor.status = 'completed'
  ) then
    raise exception
      'factual request visitor message must be a completed visitor question'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.messages as assistant
    where assistant.id = new.assistant_message_id
      and assistant.organization_id = new.organization_id
      and assistant.conversation_id = new.conversation_id
      and assistant.message_type not in (
        'visitor_question',
        'answer_retry'
      )
  ) then
    raise exception
      'factual request assistant message must belong to the conversation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_factual_request_messages()
from public;

create trigger enforce_factual_request_messages
before insert or update of
  organization_id,
  conversation_id,
  visitor_message_id,
  assistant_message_id
on public.message_factual_requests
for each row
execute function private.enforce_factual_request_messages();

alter table public.message_factual_requests enable row level security;

create policy "members can view message factual requests"
on public.message_factual_requests
for select
to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on table public.message_factual_requests from anon;
grant select on table public.message_factual_requests to authenticated;
grant select, insert, update, delete
on table public.message_factual_requests
to service_role;

alter table public.citations
add column factual_request_id uuid;

alter table public.citations
add foreign key (factual_request_id, organization_id)
references public.message_factual_requests(id, organization_id)
on delete cascade;

create index citations_factual_request_idx
on public.citations(factual_request_id)
where factual_request_id is not null;

create or replace function private.enforce_citation_grounded_answer()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages as message
    where message.id = new.message_id
      and message.organization_id = new.organization_id
      and message.conversation_id = new.conversation_id
      and message.message_type in (
        'grounded_answer',
        'partially_grounded_answer',
        'knowledge_conflict'
      )
      and message.status = 'completed'
  ) then
    raise exception 'citations require a completed grounded answer'
      using errcode = '23514';
  end if;

  if
    new.factual_request_id is not null
    and not exists (
      select 1
      from public.message_factual_requests as factual_request
      where factual_request.id = new.factual_request_id
        and factual_request.organization_id = new.organization_id
        and factual_request.conversation_id = new.conversation_id
        and factual_request.assistant_message_id = new.message_id
    )
  then
    raise exception
      'citation factual request must belong to the same message'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger enforce_citation_grounded_answer
on public.citations;

create trigger enforce_citation_grounded_answer
before insert or update of
  organization_id,
  conversation_id,
  message_id,
  factual_request_id
on public.citations
for each row
execute function private.enforce_citation_grounded_answer();

create table public.evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  conversation_id uuid not null,
  factual_request_id uuid not null,
  content_unit_id uuid not null,
  knowledge_source_id uuid not null,
  source_title text not null
    check (char_length(btrim(source_title)) between 1 and 300),
  source_url text
    check (
      source_url is null
      or char_length(source_url) between 1 and 2048
    ),
  relationship text not null
    check (relationship in ('supports', 'conflicts')),
  exact_excerpt text not null
    check (char_length(btrim(exact_excerpt)) between 1 and 2000),
  decision_reason text not null
    check (char_length(btrim(decision_reason)) between 1 and 1000),
  coverage_decision_version text not null
    check (
      char_length(btrim(coverage_decision_version)) between 1 and 120
    ),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete cascade,
  foreign key (factual_request_id, organization_id)
    references public.message_factual_requests(id, organization_id)
    on delete cascade
);

create index evidence_snapshots_request_created_at_idx
on public.evidence_snapshots(factual_request_id, created_at, id);

create function private.enforce_evidence_snapshot_candidate()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.message_factual_requests as factual_request
    where factual_request.id = new.factual_request_id
      and factual_request.organization_id = new.organization_id
      and factual_request.conversation_id = new.conversation_id
  ) then
    raise exception
      'evidence factual request must belong to the conversation'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.content_units as content_unit
    join public.knowledge_sources as knowledge_source
      on knowledge_source.id = content_unit.knowledge_source_id
      and knowledge_source.organization_id = content_unit.organization_id
      and knowledge_source.current_revision_id =
        content_unit.knowledge_revision_id
      and knowledge_source.status = 'available'
      and knowledge_source.enabled
    where content_unit.id = new.content_unit_id
      and content_unit.organization_id = new.organization_id
      and content_unit.knowledge_source_id = new.knowledge_source_id
  ) then
    raise exception
      'evidence content unit must be an organization candidate'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_evidence_snapshot_candidate()
from public;

create trigger enforce_evidence_snapshot_candidate
before insert or update of
  organization_id,
  conversation_id,
  factual_request_id,
  content_unit_id,
  knowledge_source_id
on public.evidence_snapshots
for each row
execute function private.enforce_evidence_snapshot_candidate();

alter table public.evidence_snapshots enable row level security;

create policy "members can view evidence snapshots"
on public.evidence_snapshots
for select
to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on table public.evidence_snapshots from anon;
grant select on table public.evidence_snapshots to authenticated;
grant select, insert, update, delete
on table public.evidence_snapshots
to service_role;

alter table public.unresolved_questions
drop constraint unresolved_questions_answer_message_id_key,
drop constraint unresolved_questions_trigger_type_check,
add column factual_request_id uuid,
add constraint unresolved_questions_trigger_type_check
check (
  (
    factual_request_id is null
    and trigger_type in (
      'grounded_refusal',
      'negative_feedback'
    )
  )
  or (
    factual_request_id is not null
    and trigger_type in (
      'unsupported_factual_request',
      'knowledge_conflict'
    )
  )
),
add foreign key (factual_request_id, organization_id)
  references public.message_factual_requests(id, organization_id)
  on delete cascade;

create unique index unresolved_questions_message_trigger_key
on public.unresolved_questions(answer_message_id, trigger_type)
where factual_request_id is null;

create unique index unresolved_questions_request_trigger_key
on public.unresolved_questions(
  answer_message_id,
  factual_request_id,
  trigger_type
)
where factual_request_id is not null;

create function private.enforce_unresolved_factual_request()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if
    new.factual_request_id is not null
    and not exists (
      select 1
      from public.message_factual_requests as factual_request
      where factual_request.id = new.factual_request_id
        and factual_request.organization_id = new.organization_id
        and factual_request.conversation_id = new.conversation_id
        and factual_request.visitor_message_id = new.question_message_id
        and factual_request.assistant_message_id = new.answer_message_id
        and (
          (
            new.trigger_type = 'unsupported_factual_request'
            and factual_request.coverage_status = 'unsupported'
          )
          or (
            new.trigger_type = 'knowledge_conflict'
            and factual_request.coverage_status = 'conflicting'
          )
        )
    )
  then
    raise exception
      'unresolved question factual request must match its exchange and trigger'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_unresolved_factual_request()
from public;

create trigger enforce_unresolved_factual_request
before insert or update of
  organization_id,
  conversation_id,
  question_message_id,
  answer_message_id,
  factual_request_id,
  trigger_type
on public.unresolved_questions
for each row
execute function private.enforce_unresolved_factual_request();

create or replace function private.create_unresolved_question_for_answer(
  target_answer_message_id uuid,
  target_trigger_type text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  created_unresolved_question_id uuid;
begin
  if target_trigger_type not in (
    'grounded_refusal',
    'negative_feedback'
  ) then
    raise exception 'unresolved question trigger type is invalid'
      using errcode = '22023';
  end if;

  insert into public.unresolved_questions (
    organization_id,
    conversation_id,
    question_message_id,
    answer_message_id,
    factual_request_id,
    question,
    answer_content,
    citations,
    trigger_type,
    status
  )
  select
    answer.organization_id,
    answer.conversation_id,
    question.id,
    answer.id,
    null,
    question.content,
    answer.content,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'knowledgeSourceId',
            citation.knowledge_source_id,
            'title',
            citation.source_title,
            'url',
            citation.source_url
          )
          order by citation.created_at, citation.id
        )
        from public.citations as citation
        where citation.message_id = answer.id
          and citation.organization_id = answer.organization_id
      ),
      '[]'::jsonb
    ),
    target_trigger_type,
    'pending'
  from public.messages as answer
  cross join lateral (
    select visitor.id, visitor.content
    from public.messages as visitor
    where visitor.conversation_id = answer.conversation_id
      and visitor.organization_id = answer.organization_id
      and visitor.message_type = 'visitor_question'
      and visitor.status = 'completed'
      and visitor.created_at <= answer.created_at
    order by visitor.created_at desc, visitor.id desc
    limit 1
  ) as question
  where answer.id = target_answer_message_id
    and answer.message_type in (
      'grounded_answer',
      'partially_grounded_answer',
      'grounded_refusal'
    )
    and answer.status = 'completed'
  on conflict (answer_message_id, trigger_type)
    where factual_request_id is null
  do update set answer_message_id = excluded.answer_message_id
  returning id into created_unresolved_question_id;

  return created_unresolved_question_id;
end;
$$;

create or replace function private.enforce_quality_feedback_result()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.messages as message
    where message.id = new.answer_message_id
      and message.organization_id = new.organization_id
      and message.conversation_id = new.conversation_id
      and message.message_type in (
        'grounded_answer',
        'partially_grounded_answer',
        'grounded_refusal'
      )
      and message.status = 'completed'
  ) then
    raise exception
      'quality feedback requires a completed grounded answer or refusal'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.submit_public_quality_feedback(
  assistant_public_id uuid,
  target_answer_message_id uuid,
  submitted_feedback_value text
)
returns table (
  quality_feedback_id uuid,
  unresolved_question_id uuid,
  feedback_value text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_answer public.messages%rowtype;
  saved_quality_feedback_id uuid;
  saved_unresolved_question_id uuid;
begin
  if submitted_feedback_value not in ('helpful', 'unhelpful') then
    raise exception 'quality feedback value is invalid'
      using errcode = '22023';
  end if;

  select answer.*
  into target_answer
  from public.messages as answer
  join public.conversations as conversation
    on conversation.id = answer.conversation_id
    and conversation.organization_id = answer.organization_id
  join public.assistants as assistant
    on assistant.id = conversation.assistant_id
    and assistant.organization_id = conversation.organization_id
  where answer.id = target_answer_message_id
    and assistant.public_id = assistant_public_id
    and answer.message_type in (
      'grounded_answer',
      'partially_grounded_answer',
      'grounded_refusal'
    )
    and answer.status = 'completed';

  if target_answer.id is null then
    raise exception 'quality feedback target is invalid'
      using errcode = '22023';
  end if;

  insert into public.quality_feedback (
    organization_id,
    conversation_id,
    answer_message_id,
    feedback_value
  ) values (
    target_answer.organization_id,
    target_answer.conversation_id,
    target_answer.id,
    submitted_feedback_value
  )
  on conflict (answer_message_id)
  do update set
    feedback_value = excluded.feedback_value,
    updated_at = now()
  returning id into saved_quality_feedback_id;

  if submitted_feedback_value = 'unhelpful' then
    saved_unresolved_question_id :=
      private.create_unresolved_question_for_answer(
        target_answer.id,
        'negative_feedback'
      );
  end if;

  return query
  select
    saved_quality_feedback_id,
    saved_unresolved_question_id,
    submitted_feedback_value;
end;
$$;

create or replace function private.enforce_message_result_dependents()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if
    (
      new.message_type not in (
        'grounded_answer',
        'partially_grounded_answer',
        'knowledge_conflict'
      )
      or new.status <> 'completed'
    )
    and exists (
      select 1
      from public.citations as citation
      where citation.message_id = new.id
        and citation.organization_id = new.organization_id
    )
  then
    raise exception 'only completed grounded answers may retain citations'
      using errcode = '23514';
  end if;

  if
    (
      new.message_type not in (
        'grounded_answer',
        'partially_grounded_answer',
        'grounded_refusal'
      )
      or new.status <> 'completed'
    )
    and exists (
      select 1
      from public.quality_feedback as feedback
      where feedback.answer_message_id = new.id
        and feedback.organization_id = new.organization_id
    )
  then
    raise exception
      'only completed grounded answers or refusals may retain quality feedback'
      using errcode = '23514';
  end if;

  if
    new.message_type not in (
      'grounded_answer',
      'partially_grounded_answer',
      'knowledge_conflict',
      'grounded_refusal'
    )
    and exists (
      select 1
      from public.unresolved_questions as unresolved
      where unresolved.answer_message_id = new.id
        and unresolved.organization_id = new.organization_id
    )
  then
    raise exception
      'only answer outcomes may retain unresolved questions'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
