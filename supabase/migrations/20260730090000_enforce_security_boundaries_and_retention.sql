create extension if not exists pg_cron;

update public.citations as citation
set knowledge_source_id = null
where citation.knowledge_source_id is not null
  and not exists (
    select 1
    from public.knowledge_sources as source
    where source.id = citation.knowledge_source_id
      and source.organization_id = citation.organization_id
  );

alter table public.citations
add constraint citations_knowledge_source_organization_fkey
foreign key (knowledge_source_id, organization_id)
references public.knowledge_sources(id, organization_id)
on delete set null (knowledge_source_id);

create or replace function public.complete_public_conversation(
  assistant_public_id uuid,
  target_conversation_id uuid,
  result_type text,
  result_content text,
  result_citations jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conversation_organization_id uuid;
  completed_message_id uuid;
begin
  result_content := btrim(result_content);

  if result_type not in ('grounded_answer', 'grounded_refusal') then
    raise exception 'public conversation result type is invalid'
      using errcode = '22023';
  end if;

  if
    result_content is null
    or char_length(result_content) not between 1 and 20000
  then
    raise exception 'public conversation result content is invalid'
      using errcode = '22023';
  end if;

  if
    result_citations is null
    or jsonb_typeof(result_citations) <> 'array'
  then
    raise exception 'public conversation citations are invalid'
      using errcode = '22023';
  end if;

  select conversation.organization_id
  into conversation_organization_id
  from public.conversations as conversation
  join public.assistants as assistant
    on assistant.id = conversation.assistant_id
    and assistant.organization_id = conversation.organization_id
  where conversation.id = target_conversation_id
    and assistant.public_id = assistant_public_id;

  if conversation_organization_id is null then
    raise exception 'public conversation not found' using errcode = 'P0002';
  end if;

  update public.messages
  set
    message_type = result_type,
    content = result_content,
    status = 'completed'
  where conversation_id = target_conversation_id
    and organization_id = conversation_organization_id
    and message_type = 'grounded_answer'
    and status = 'pending'
  returning id into completed_message_id;

  if completed_message_id is null then
    raise exception 'pending assistant message not found'
      using errcode = 'P0002';
  end if;

  if result_type = 'grounded_answer' then
    insert into public.citations (
      organization_id,
      conversation_id,
      message_id,
      knowledge_source_id,
      source_title,
      source_url
    )
    select
      conversation_organization_id,
      target_conversation_id,
      completed_message_id,
      source.id,
      source.title,
      source.original_url
    from jsonb_array_elements(result_citations) with ordinality as citation(
      value,
      position
    )
    join public.knowledge_sources as source
      on source.id =
        nullif(citation.value ->> 'knowledgeSourceId', '')::uuid
      and source.organization_id = conversation_organization_id
    order by citation.position
    limit 3;
  end if;

  return completed_message_id;
end;
$$;

create function private.purge_expired_data(
  reference_time timestamptz default clock_timestamp()
)
returns table (
  deleted_conversations bigint,
  deleted_ai_call_logs bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  retention_cutoff timestamptz;
begin
  if reference_time is null then
    raise exception 'retention reference time is required'
      using errcode = '22023';
  end if;

  retention_cutoff := reference_time - interval '30 days';

  with deleted as (
    delete from public.conversations as conversation
    where conversation.last_activity_at < retention_cutoff
    returning 1
  )
  select count(*)
  into deleted_conversations
  from deleted;

  with deleted as (
    delete from public.ai_call_logs as call_log
    where call_log.created_at < retention_cutoff
    returning 1
  )
  select count(*)
  into deleted_ai_call_logs
  from deleted;

  return next;
end;
$$;

comment on function private.purge_expired_data(timestamptz) is
  'Deletes anonymous conversations and metadata-only AI call logs after the explicit 30-day retention period.';

revoke all
on function private.purge_expired_data(timestamptz)
from public;

select cron.schedule(
  'grounded-desk-daily-retention',
  '15 3 * * *',
  'select private.purge_expired_data();'
);
