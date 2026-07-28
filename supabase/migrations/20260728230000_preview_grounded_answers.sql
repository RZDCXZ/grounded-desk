create index content_units_embedding_hnsw_idx
on public.content_units
using hnsw (embedding extensions.vector_cosine_ops);

create table public.ai_call_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  call_type text not null
    check (call_type in ('embedding', 'rerank', 'answer')),
  provider text not null
    check (char_length(btrim(provider)) between 1 and 80),
  model text not null
    check (char_length(btrim(model)) between 1 and 160),
  input_tokens integer not null default 0
    check (input_tokens >= 0),
  output_tokens integer not null default 0
    check (output_tokens >= 0),
  total_tokens integer not null default 0
    check (
      total_tokens >= 0
      and total_tokens >= input_tokens
      and total_tokens >= output_tokens
    ),
  duration_ms integer not null
    check (duration_ms >= 0),
  outcome text not null
    check (outcome in ('success', 'error')),
  error_type text,
  trace_id text not null
    check (char_length(btrim(trace_id)) between 1 and 200),
  created_at timestamptz not null default now(),
  check (
    (outcome = 'success' and error_type is null)
    or (
      outcome = 'error'
      and char_length(btrim(error_type)) between 1 and 80
    )
  )
);

create index ai_call_logs_organization_created_at_idx
on public.ai_call_logs(organization_id, created_at desc);

alter table public.ai_call_logs enable row level security;

create policy "members can read provider call logs"
on public.ai_call_logs
for select
to authenticated
using ((select private.is_organization_member(organization_id)));

create policy "members can record provider call logs"
on public.ai_call_logs
for insert
to authenticated
with check ((select private.is_organization_member(organization_id)));

revoke all on table public.ai_call_logs from anon;
grant select, insert on table public.ai_call_logs to authenticated;

create function public.retrieve_available_content_units(
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
set search_path = ''
as $$
declare
  current_organization_id uuid;
begin
  if query_embedding is null then
    raise exception 'query embedding is required'
      using errcode = '22023';
  end if;

  if candidate_limit is null or candidate_limit not between 1 and 100 then
    raise exception 'candidate limit must be between 1 and 100'
      using errcode = '22023';
  end if;

  select membership.organization_id
  into current_organization_id
  from public.organization_members as membership
  where membership.user_id = (select auth.uid())
    and membership.role = 'administrator'
  limit 1;

  if current_organization_id is null then
    raise exception 'administrator membership required'
      using errcode = '42501';
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
  where unit.organization_id = current_organization_id
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
on function public.retrieve_available_content_units(
  extensions.vector,
  integer
)
from public;

grant execute
on function public.retrieve_available_content_units(
  extensions.vector,
  integer
)
to authenticated;
