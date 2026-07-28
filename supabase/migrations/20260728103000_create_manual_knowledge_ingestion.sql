create extension if not exists vector
with schema extensions;

alter table public.knowledge_sources
add column original_url text,
add column failure_reason text,
add column current_revision_id uuid;

alter table public.knowledge_sources
add constraint knowledge_sources_id_organization_key
unique (id, organization_id);

create table public.knowledge_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_source_id uuid not null,
  title text not null,
  body text not null,
  original_url text,
  status text not null default 'processing'
    check (status in ('processing', 'available', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, organization_id),
  unique (id, organization_id, knowledge_source_id),
  foreign key (knowledge_source_id, organization_id)
    references public.knowledge_sources(id, organization_id)
    on delete cascade
);

alter table public.knowledge_sources
add constraint knowledge_sources_current_revision_fkey
foreign key (current_revision_id, organization_id, id)
references public.knowledge_revisions(id, organization_id, knowledge_source_id);

create index knowledge_revisions_source_created_at_idx
on public.knowledge_revisions(knowledge_source_id, created_at desc);

alter table public.knowledge_revisions enable row level security;

create policy "members can manage knowledge revisions"
on public.knowledge_revisions
for all
to authenticated
using ((select private.is_organization_member(organization_id)))
with check ((select private.is_organization_member(organization_id)));

revoke all on table public.knowledge_revisions from anon;
grant select, insert, update, delete on table public.knowledge_revisions
to authenticated;

create table public.content_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_source_id uuid not null,
  knowledge_revision_id uuid not null,
  position integer not null check (position >= 0),
  heading text,
  content text not null check (char_length(trim(content)) > 0),
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now(),
  unique (knowledge_revision_id, position),
  foreign key (knowledge_source_id, organization_id)
    references public.knowledge_sources(id, organization_id)
    on delete cascade,
  foreign key (knowledge_revision_id, organization_id, knowledge_source_id)
    references public.knowledge_revisions(id, organization_id, knowledge_source_id)
    on delete cascade
);

create index content_units_available_revision_idx
on public.content_units(organization_id, knowledge_revision_id, position);

alter table public.content_units enable row level security;

create policy "members can manage content units"
on public.content_units
for all
to authenticated
using ((select private.is_organization_member(organization_id)))
with check ((select private.is_organization_member(organization_id)));

revoke all on table public.content_units from anon;
grant select, insert, update, delete on table public.content_units
to authenticated;

create function public.create_manual_knowledge_source(
  source_title text,
  source_body text,
  source_original_url text default null
)
returns table (
  knowledge_source_id uuid,
  knowledge_revision_id uuid
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  current_organization_id uuid;
begin
  source_title := trim(source_title);
  source_original_url := nullif(trim(source_original_url), '');

  if source_title is null
    or char_length(source_title) not between 1 and 160 then
    raise exception 'knowledge source title is required'
      using errcode = '22023';
  end if;

  if source_body is null or char_length(trim(source_body)) = 0 then
    raise exception 'knowledge source body is required'
      using errcode = '22023';
  end if;

  if source_original_url is not null
    and (
      char_length(source_original_url) > 2048
      or source_original_url !~* '^https?://'
    ) then
    raise exception 'knowledge source original URL must use HTTP or HTTPS'
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

  insert into public.knowledge_sources (
    organization_id,
    title,
    source_type,
    original_url,
    status
  ) values (
    current_organization_id,
    source_title,
    'manual',
    source_original_url,
    'processing'
  )
  returning id into knowledge_source_id;

  insert into public.knowledge_revisions (
    organization_id,
    knowledge_source_id,
    title,
    body,
    original_url
  ) values (
    current_organization_id,
    knowledge_source_id,
    source_title,
    source_body,
    source_original_url
  )
  returning id into knowledge_revision_id;

  return next;
end;
$$;

revoke all on function public.create_manual_knowledge_source(text, text, text)
from public;
grant execute
on function public.create_manual_knowledge_source(text, text, text)
to authenticated;

create function public.complete_manual_knowledge_revision(
  revision_id uuid,
  revision_content_units jsonb
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  revision_organization_id uuid;
  revision_source_id uuid;
begin
  if jsonb_typeof(revision_content_units) <> 'array'
    or jsonb_array_length(revision_content_units) = 0 then
    raise exception 'at least one content unit is required'
      using errcode = '22023';
  end if;

  select revision.organization_id, revision.knowledge_source_id
  into revision_organization_id, revision_source_id
  from public.knowledge_revisions as revision
  where revision.id = revision_id
    and revision.status = 'processing'
  for update;

  if revision_organization_id is null then
    raise exception 'processing knowledge revision not found'
      using errcode = 'P0002';
  end if;

  insert into public.content_units (
    organization_id,
    knowledge_source_id,
    knowledge_revision_id,
    position,
    heading,
    content,
    embedding
  )
  select
    revision_organization_id,
    revision_source_id,
    revision_id,
    unit.position,
    unit.heading,
    unit.content,
    unit.embedding::text::extensions.vector(1024)
  from jsonb_to_recordset(revision_content_units) as unit(
    position integer,
    heading text,
    content text,
    embedding jsonb
  );

  update public.knowledge_revisions
  set
    status = 'available',
    failure_reason = null,
    completed_at = now()
  where id = revision_id;

  update public.knowledge_sources
  set
    status = 'available',
    failure_reason = null,
    current_revision_id = revision_id,
    updated_at = now()
  where id = revision_source_id
    and organization_id = revision_organization_id;
end;
$$;

revoke all
on function public.complete_manual_knowledge_revision(uuid, jsonb)
from public;
grant execute
on function public.complete_manual_knowledge_revision(uuid, jsonb)
to authenticated;

create function public.fail_manual_knowledge_revision(
  revision_id uuid,
  safe_failure_reason text
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  revision_organization_id uuid;
  revision_source_id uuid;
begin
  if char_length(trim(safe_failure_reason)) = 0 then
    raise exception 'failure reason is required'
      using errcode = '22023';
  end if;

  select revision.organization_id, revision.knowledge_source_id
  into revision_organization_id, revision_source_id
  from public.knowledge_revisions as revision
  where revision.id = revision_id
    and revision.status = 'processing'
  for update;

  if revision_organization_id is null then
    raise exception 'processing knowledge revision not found'
      using errcode = 'P0002';
  end if;

  delete from public.content_units
  where knowledge_revision_id = revision_id;

  update public.knowledge_revisions
  set
    status = 'failed',
    failure_reason = safe_failure_reason,
    completed_at = now()
  where id = revision_id;

  update public.knowledge_sources
  set
    status = case
      when current_revision_id is null then 'failed'
      else 'available'
    end,
    failure_reason = safe_failure_reason,
    updated_at = now()
  where id = revision_source_id
    and organization_id = revision_organization_id;
end;
$$;

revoke all
on function public.fail_manual_knowledge_revision(uuid, text)
from public;
grant execute
on function public.fail_manual_knowledge_revision(uuid, text)
to authenticated;
