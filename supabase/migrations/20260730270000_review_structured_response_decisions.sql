alter table public.ai_call_logs
add column conversation_id uuid,
add column assistant_message_id uuid,
add column factual_request_id uuid,
add constraint ai_call_logs_conversation_organization_fkey
  foreign key (conversation_id, organization_id)
  references public.conversations(id, organization_id)
  on delete cascade,
add constraint ai_call_logs_message_organization_fkey
  foreign key (assistant_message_id, organization_id)
  references public.messages(id, organization_id)
  on delete cascade,
add constraint ai_call_logs_audit_context_check
  check (
    (
      conversation_id is null
      and assistant_message_id is null
      and factual_request_id is null
    )
    or
    (conversation_id is not null and assistant_message_id is not null)
  );

create index ai_call_logs_conversation_message_created_at_idx
on public.ai_call_logs(
  conversation_id,
  assistant_message_id,
  created_at,
  id
)
where conversation_id is not null;

drop policy "members can record provider call logs"
on public.ai_call_logs;

create policy "members can record preview provider call logs"
on public.ai_call_logs
for insert
to authenticated
with check (
  (select private.is_organization_member(organization_id))
  and conversation_id is null
  and assistant_message_id is null
  and factual_request_id is null
);

alter table public.message_factual_requests
add column coverage_decision_version text
check (
  coverage_decision_version is null
  or char_length(btrim(coverage_decision_version)) between 1 and 120
);

create function private.assign_factual_request_coverage_version()
returns trigger
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  new.coverage_decision_version := case
    when new.coverage_status is null then null
    else 'evidence-coverage-v1'
  end;

  return new;
end;
$$;

revoke all
on function private.assign_factual_request_coverage_version()
from public;

create trigger assign_factual_request_coverage_version
before insert or update of coverage_status
on public.message_factual_requests
for each row
execute function private.assign_factual_request_coverage_version();

create function private.enforce_ai_call_audit_context()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if
    (
      new.conversation_id is not null
      and not exists (
        select 1
        from public.messages as message
        where message.id = new.assistant_message_id
          and message.organization_id = new.organization_id
          and message.conversation_id = new.conversation_id
          and message.message_type not in (
            'visitor_question',
            'answer_retry'
          )
      )
    )
  then
    raise exception 'AI call audit context is invalid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_ai_call_audit_context()
from public;

create trigger enforce_ai_call_audit_context
before insert or update of
  organization_id,
  conversation_id,
  assistant_message_id
on public.ai_call_logs
for each row
execute function private.enforce_ai_call_audit_context();

drop function public.record_public_assistant_ai_call(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  text,
  text
);

create function public.record_public_assistant_ai_call(
  assistant_public_id uuid,
  logged_call_type text,
  logged_provider text,
  logged_model text,
  logged_input_tokens integer,
  logged_output_tokens integer,
  logged_total_tokens integer,
  logged_duration_ms integer,
  logged_outcome text,
  logged_error_type text,
  logged_trace_id text,
  target_conversation_id uuid default null,
  target_assistant_message_id uuid default null,
  target_factual_request_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_assistant_id uuid;
  assistant_organization_id uuid;
begin
  select id, organization_id
  into v_assistant_id, assistant_organization_id
  from public.assistants
  where public_id = assistant_public_id;

  if assistant_organization_id is null then
    raise exception 'public assistant not found' using errcode = 'P0002';
  end if;

  if
    (
      target_conversation_id is null
      and (
        target_assistant_message_id is not null
        or target_factual_request_id is not null
      )
    )
    or (
      target_conversation_id is not null
      and target_assistant_message_id is null
    )
    or (
      target_conversation_id is not null
      and not exists (
        select 1
        from public.conversations as conversation
        join public.messages as message
          on message.id = target_assistant_message_id
          and message.organization_id =
            conversation.organization_id
          and message.conversation_id = conversation.id
          and message.message_type not in (
            'visitor_question',
            'answer_retry'
          )
        where conversation.id = target_conversation_id
          and conversation.organization_id =
            assistant_organization_id
          and conversation.assistant_id = v_assistant_id
      )
    )
  then
    raise exception 'public AI call audit context is invalid'
      using errcode = '23514';
  end if;

  insert into public.ai_call_logs (
    organization_id,
    conversation_id,
    assistant_message_id,
    factual_request_id,
    call_type,
    provider,
    model,
    input_tokens,
    output_tokens,
    total_tokens,
    duration_ms,
    outcome,
    error_type,
    trace_id
  ) values (
    assistant_organization_id,
    target_conversation_id,
    target_assistant_message_id,
    target_factual_request_id,
    logged_call_type,
    logged_provider,
    logged_model,
    logged_input_tokens,
    logged_output_tokens,
    logged_total_tokens,
    logged_duration_ms,
    logged_outcome,
    logged_error_type,
    logged_trace_id
  );
end;
$$;

revoke all
on function public.record_public_assistant_ai_call(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid
)
from public;

grant execute
on function public.record_public_assistant_ai_call(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid
)
to service_role;
