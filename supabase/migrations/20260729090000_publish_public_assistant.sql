alter table public.assistants
alter column public_id drop not null,
alter column public_id drop default;

update public.assistants
set public_id = null
where status = 'draft';

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  conversation_id uuid not null,
  message_type text not null
    check (
      message_type in (
        'visitor_question',
        'grounded_answer',
        'grounded_refusal',
        'technical_failure'
      )
    ),
  content text not null,
  status text not null
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete cascade,
  check (
    (message_type = 'grounded_answer' and status = 'pending')
    or char_length(btrim(content)) between 1 and 20000
  )
);

create index messages_conversation_created_at_idx
on public.messages(conversation_id, created_at);

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  knowledge_source_id uuid,
  source_title text not null
    check (char_length(btrim(source_title)) between 1 and 300),
  source_url text,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete cascade,
  foreign key (message_id, organization_id)
    references public.messages(id, organization_id)
    on delete cascade,
  check (
    source_url is null
    or char_length(source_url) between 1 and 2048
  )
);

create index citations_conversation_message_idx
on public.citations(conversation_id, message_id);

alter table public.messages enable row level security;
alter table public.citations enable row level security;

create policy "members can manage conversation messages"
on public.messages
for all
to authenticated
using ((select private.is_organization_member(organization_id)))
with check ((select private.is_organization_member(organization_id)));

create policy "members can manage conversation citations"
on public.citations
for all
to authenticated
using ((select private.is_organization_member(organization_id)))
with check ((select private.is_organization_member(organization_id)));

revoke all on table public.messages from anon;
revoke all on table public.citations from anon;

grant select, insert, update, delete
on table public.messages
to authenticated;

grant select, insert, update, delete
on table public.citations
to authenticated;

create function public.publish_assistant()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  current_organization_id uuid;
  published_public_id uuid;
begin
  select organization_id
  into current_organization_id
  from public.organization_members
  where user_id = (select auth.uid())
    and role = 'administrator'
  limit 1;

  if current_organization_id is null then
    raise exception 'administrator organization not found'
      using errcode = '42501';
  end if;

  update public.assistants
  set
    status = 'published',
    public_id = coalesce(public_id, gen_random_uuid()),
    updated_at = now()
  where organization_id = current_organization_id
  returning public_id into published_public_id;

  if published_public_id is null then
    raise exception 'assistant not found' using errcode = 'P0002';
  end if;

  return published_public_id;
end;
$$;

revoke all on function public.publish_assistant() from public;
grant execute on function public.publish_assistant() to authenticated;

create function public.take_assistant_offline()
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  current_organization_id uuid;
  offline_public_id uuid;
begin
  select organization_id
  into current_organization_id
  from public.organization_members
  where user_id = (select auth.uid())
    and role = 'administrator'
  limit 1;

  if current_organization_id is null then
    raise exception 'administrator organization not found'
      using errcode = '42501';
  end if;

  update public.assistants
  set
    status = 'offline',
    updated_at = now()
  where organization_id = current_organization_id
    and public_id is not null
  returning public_id into offline_public_id;

  if offline_public_id is null then
    raise exception 'published assistant not found' using errcode = 'P0002';
  end if;

  return offline_public_id;
end;
$$;

revoke all on function public.take_assistant_offline() from public;
grant execute on function public.take_assistant_offline() to authenticated;

create function public.get_published_assistant(
  assistant_public_id uuid
)
returns table (
  public_id uuid,
  name text,
  welcome_message text,
  service_scope text,
  tone text,
  human_contact_label text,
  human_contact_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    assistant.public_id,
    assistant.name,
    assistant.welcome_message,
    assistant.service_scope,
    assistant.tone,
    assistant.human_contact_label,
    assistant.human_contact_url
  from public.assistants as assistant
  where assistant.public_id = assistant_public_id
    and assistant.status = 'published';
$$;

revoke all
on function public.get_published_assistant(uuid)
from public;

grant execute
on function public.get_published_assistant(uuid)
to service_role;

create function public.begin_public_conversation(
  assistant_public_id uuid,
  visitor_question text
)
returns table (
  conversation_id uuid,
  assistant_message_id uuid,
  organization_id uuid,
  assistant_id uuid,
  name text,
  service_scope text,
  tone text,
  human_contact_label text,
  human_contact_url text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  published_assistant public.assistants%rowtype;
  created_conversation_id uuid;
  created_assistant_message_id uuid;
begin
  visitor_question := btrim(visitor_question);

  if
    visitor_question is null
    or char_length(visitor_question) not between 1 and 2000
  then
    raise exception 'visitor question is invalid' using errcode = '22023';
  end if;

  select assistant.*
  into published_assistant
  from public.assistants as assistant
  where assistant.public_id = assistant_public_id
    and assistant.status = 'published';

  if published_assistant.id is null then
    raise exception 'published assistant not found' using errcode = 'P0002';
  end if;

  insert into public.conversations (
    organization_id,
    assistant_id
  ) values (
    published_assistant.organization_id,
    published_assistant.id
  )
  returning id into created_conversation_id;

  insert into public.messages (
    organization_id,
    conversation_id,
    message_type,
    content,
    status
  ) values
    (
      published_assistant.organization_id,
      created_conversation_id,
      'visitor_question',
      visitor_question,
      'completed'
    ),
    (
      published_assistant.organization_id,
      created_conversation_id,
      'grounded_answer',
      '',
      'pending'
    );

  select id
  into created_assistant_message_id
  from public.messages as message
  where message.conversation_id = created_conversation_id
    and message.organization_id = published_assistant.organization_id
    and message.message_type = 'grounded_answer'
    and message.status = 'pending';

  return query
  select
    created_conversation_id,
    created_assistant_message_id,
    published_assistant.organization_id,
    published_assistant.id,
    published_assistant.name,
    published_assistant.service_scope,
    published_assistant.tone,
    published_assistant.human_contact_label,
    published_assistant.human_contact_url;
end;
$$;

revoke all
on function public.begin_public_conversation(uuid, text)
from public;

grant execute
on function public.begin_public_conversation(uuid, text)
to service_role;

create function public.complete_public_conversation(
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
      nullif(citation.value ->> 'knowledgeSourceId', '')::uuid,
      btrim(citation.value ->> 'title'),
      nullif(btrim(citation.value ->> 'url'), '')
    from jsonb_array_elements(result_citations) with ordinality as citation(
      value,
      position
    )
    where
      char_length(btrim(citation.value ->> 'title')) between 1 and 300
    order by citation.position
    limit 3;
  end if;

  return completed_message_id;
end;
$$;

revoke all
on function public.complete_public_conversation(
  uuid,
  uuid,
  text,
  text,
  jsonb
)
from public;

grant execute
on function public.complete_public_conversation(
  uuid,
  uuid,
  text,
  text,
  jsonb
)
to service_role;

create function public.fail_public_conversation(
  assistant_public_id uuid,
  target_conversation_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conversation_organization_id uuid;
  failed_message_id uuid;
begin
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
    message_type = 'technical_failure',
    content = '服务暂时不可用，请稍后重试。',
    status = 'failed'
  where conversation_id = target_conversation_id
    and organization_id = conversation_organization_id
    and message_type = 'grounded_answer'
    and status = 'pending'
  returning id into failed_message_id;

  if failed_message_id is null then
    raise exception 'pending assistant message not found'
      using errcode = 'P0002';
  end if;

  return failed_message_id;
end;
$$;

revoke all
on function public.fail_public_conversation(uuid, uuid)
from public;

grant execute
on function public.fail_public_conversation(uuid, uuid)
to service_role;

create function public.retrieve_public_assistant_content_units(
  assistant_public_id uuid,
  query_embedding extensions.vector(1024),
  candidate_limit integer
)
returns table (
  content_unit_id uuid,
  knowledge_source_id uuid,
  source_title text,
  source_url text,
  heading text,
  content text,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  published_organization_id uuid;
begin
  if query_embedding is null then
    raise exception 'query embedding is required'
      using errcode = '22023';
  end if;

  if candidate_limit is null or candidate_limit not between 1 and 100 then
    raise exception 'candidate limit must be between 1 and 100'
      using errcode = '22023';
  end if;

  select organization_id
  into published_organization_id
  from public.assistants
  where public_id = assistant_public_id
    and status = 'published';

  if published_organization_id is null then
    raise exception 'published assistant not found' using errcode = 'P0002';
  end if;

  return query
  select
    unit.id,
    source.id,
    source.title,
    source.original_url,
    unit.heading,
    unit.content,
    1 - (
      unit.embedding
      operator(extensions.<=>)
      query_embedding
    )
  from public.content_units as unit
  join public.knowledge_sources as source
    on source.id = unit.knowledge_source_id
    and source.organization_id = unit.organization_id
    and source.current_revision_id = unit.knowledge_revision_id
  join public.knowledge_revisions as revision
    on revision.id = unit.knowledge_revision_id
    and revision.organization_id = unit.organization_id
    and revision.knowledge_source_id = unit.knowledge_source_id
  where unit.organization_id = published_organization_id
    and source.enabled
    and source.status = 'available'
    and revision.status = 'available'
  order by
    unit.embedding
    operator(extensions.<=>)
    query_embedding
  limit candidate_limit;
end;
$$;

revoke all
on function public.retrieve_public_assistant_content_units(
  uuid,
  extensions.vector,
  integer
)
from public;

grant execute
on function public.retrieve_public_assistant_content_units(
  uuid,
  extensions.vector,
  integer
)
to service_role;

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
  logged_trace_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  assistant_organization_id uuid;
begin
  select organization_id
  into assistant_organization_id
  from public.assistants
  where public_id = assistant_public_id;

  if assistant_organization_id is null then
    raise exception 'public assistant not found' using errcode = 'P0002';
  end if;

  insert into public.ai_call_logs (
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
    trace_id
  ) values (
    assistant_organization_id,
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
  text
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
  text
)
to service_role;
