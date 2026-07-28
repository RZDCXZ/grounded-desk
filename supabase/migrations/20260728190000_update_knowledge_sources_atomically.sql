alter table public.knowledge_revisions
drop constraint knowledge_revisions_status_check;

update public.knowledge_revisions as revision
set status = 'superseded'
from public.knowledge_sources as source
where source.id = revision.knowledge_source_id
  and source.organization_id = revision.organization_id
  and revision.status = 'available'
  and revision.id is distinct from source.current_revision_id;

alter table public.knowledge_revisions
add constraint knowledge_revisions_status_check
check (status in ('processing', 'available', 'failed', 'superseded'));

alter table public.knowledge_revisions
add column processing_stage text;

update public.knowledge_revisions as revision
set processing_stage = case
  when source.source_type = 'url' then 'fetching'
  else 'forming_content_units'
end
from public.knowledge_sources as source
where source.id = revision.knowledge_source_id
  and source.organization_id = revision.organization_id
  and revision.status = 'processing';

alter table public.knowledge_revisions
add constraint knowledge_revisions_processing_stage_check
check (
  processing_stage is null
  or processing_stage in (
    'fetching',
    'extracting',
    'forming_content_units',
    'vectorizing'
  )
);

alter table public.knowledge_revisions
add constraint knowledge_revisions_processing_stage_required_check
check (status <> 'processing' or processing_stage is not null);

create unique index knowledge_revisions_one_available_per_source_idx
on public.knowledge_revisions(organization_id, knowledge_source_id)
where status = 'available';

create unique index knowledge_revisions_one_processing_per_source_idx
on public.knowledge_revisions(organization_id, knowledge_source_id)
where status = 'processing';

alter table public.knowledge_revisions
alter column processing_stage set default 'forming_content_units';

create function public.advance_knowledge_revision_stage(
  revision_id uuid,
  next_stage text
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if next_stage not in (
    'fetching',
    'extracting',
    'forming_content_units',
    'vectorizing'
  ) then
    raise exception 'invalid knowledge revision processing stage'
      using errcode = '22023';
  end if;

  update public.knowledge_revisions as revision
  set processing_stage = next_stage
  where revision.id = revision_id
    and revision.status = 'processing'
    and (select private.is_organization_member(revision.organization_id));

  if not found then
    raise exception 'processing knowledge revision not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all
on function public.advance_knowledge_revision_stage(uuid, text)
from public;
grant execute
on function public.advance_knowledge_revision_stage(uuid, text)
to authenticated;

create function public.update_manual_knowledge_source(
  target_source_id uuid,
  source_title text,
  source_body text,
  source_original_url text default null
)
returns table (knowledge_revision_id uuid)
language plpgsql
volatile
set search_path = ''
as $$
declare
  source_organization_id uuid;
  saved_source_type text;
  source_enabled boolean;
  source_current_revision_id uuid;
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

  select
    source.organization_id,
    source.source_type,
    source.enabled,
    source.current_revision_id
  into
    source_organization_id,
    saved_source_type,
    source_enabled,
    source_current_revision_id
  from public.knowledge_sources as source
  where source.id = target_source_id
    and (select private.is_organization_member(source.organization_id))
  for update;

  if source_organization_id is null then
    raise exception 'knowledge source not found'
      using errcode = 'P0002';
  end if;

  if saved_source_type <> 'manual' then
    raise exception 'manual knowledge source required'
      using errcode = '22023';
  end if;

  if not source_enabled then
    raise exception 'disabled knowledge source cannot be updated'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.knowledge_revisions as revision
    where revision.organization_id = source_organization_id
      and revision.knowledge_source_id = target_source_id
      and revision.status = 'processing'
  ) then
    raise exception 'knowledge source already has a processing revision'
      using errcode = '55000';
  end if;

  insert into public.knowledge_revisions (
    organization_id,
    knowledge_source_id,
    title,
    body,
    original_url,
    processing_stage
  ) values (
    source_organization_id,
    target_source_id,
    source_title,
    source_body,
    source_original_url,
    'forming_content_units'
  )
  returning id into knowledge_revision_id;

  update public.knowledge_sources
  set
    status = case
      when source_current_revision_id is null then 'processing'
      else 'available'
    end,
    failure_reason = null,
    updated_at = now()
  where id = target_source_id
    and organization_id = source_organization_id;

  return next;
end;
$$;

revoke all
on function public.update_manual_knowledge_source(uuid, text, text, text)
from public;
grant execute
on function public.update_manual_knowledge_source(uuid, text, text, text)
to authenticated;

create function public.refresh_web_knowledge_source(target_source_id uuid)
returns table (
  knowledge_revision_id uuid,
  original_url text
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  source_organization_id uuid;
  source_title text;
  source_enabled boolean;
  source_current_revision_id uuid;
begin
  select
    source.organization_id,
    source.title,
    source.original_url,
    source.enabled,
    source.current_revision_id
  into
    source_organization_id,
    source_title,
    original_url,
    source_enabled,
    source_current_revision_id
  from public.knowledge_sources as source
  where source.id = target_source_id
    and source.source_type = 'url'
    and (select private.is_organization_member(source.organization_id))
  for update;

  if source_organization_id is null then
    raise exception 'web knowledge source not found'
      using errcode = 'P0002';
  end if;

  if not source_enabled then
    raise exception 'disabled knowledge source cannot be updated'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.knowledge_revisions as revision
    where revision.organization_id = source_organization_id
      and revision.knowledge_source_id = target_source_id
      and revision.status = 'processing'
  ) then
    raise exception 'knowledge source already has a processing revision'
      using errcode = '55000';
  end if;

  insert into public.knowledge_revisions (
    organization_id,
    knowledge_source_id,
    title,
    body,
    original_url,
    processing_stage
  ) values (
    source_organization_id,
    target_source_id,
    source_title,
    '',
    original_url,
    'fetching'
  )
  returning id into knowledge_revision_id;

  update public.knowledge_sources
  set
    status = case
      when source_current_revision_id is null then 'processing'
      else 'available'
    end,
    failure_reason = null,
    updated_at = now()
  where id = target_source_id
    and organization_id = source_organization_id;

  return next;
end;
$$;

revoke all
on function public.refresh_web_knowledge_source(uuid)
from public;
grant execute
on function public.refresh_web_knowledge_source(uuid)
to authenticated;

create or replace function public.complete_knowledge_revision(
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
  previous_revision_id uuid;
  source_enabled boolean;
begin
  if jsonb_typeof(revision_content_units) <> 'array'
    or jsonb_array_length(revision_content_units) = 0 then
    raise exception 'at least one content unit is required'
      using errcode = '22023';
  end if;

  select
    revision.organization_id,
    revision.knowledge_source_id,
    source.current_revision_id,
    source.enabled
  into
    revision_organization_id,
    revision_source_id,
    previous_revision_id,
    source_enabled
  from public.knowledge_revisions as revision
  join public.knowledge_sources as source
    on source.id = revision.knowledge_source_id
    and source.organization_id = revision.organization_id
  where revision.id = revision_id
    and revision.status = 'processing'
  for update of source, revision;

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
  set status = 'superseded'
  where id = previous_revision_id
    and id <> revision_id
    and organization_id = revision_organization_id
    and knowledge_source_id = revision_source_id;

  update public.knowledge_revisions
  set
    status = 'available',
    failure_reason = null,
    processing_stage = null,
    completed_at = now()
  where id = revision_id;

  update public.knowledge_sources as source
  set
    title = revision.title,
    original_url = revision.original_url,
    status = case
      when source_enabled then 'available'
      else 'disabled'
    end,
    failure_reason = null,
    current_revision_id = revision_id,
    updated_at = now()
  from public.knowledge_revisions as revision
  where source.id = revision_source_id
    and source.organization_id = revision_organization_id
    and revision.id = revision_id;
end;
$$;

create or replace function public.prepare_web_knowledge_revision(
  revision_id uuid,
  extracted_title text,
  extracted_body text
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  revision_organization_id uuid;
begin
  extracted_title := trim(extracted_title);

  if extracted_title is null
    or char_length(extracted_title) not between 1 and 160 then
    raise exception 'extracted web page title is required'
      using errcode = '22023';
  end if;

  if extracted_body is null or char_length(trim(extracted_body)) = 0 then
    raise exception 'extracted web page body is required'
      using errcode = '22023';
  end if;

  select revision.organization_id
  into revision_organization_id
  from public.knowledge_revisions as revision
  join public.knowledge_sources as source
    on source.id = revision.knowledge_source_id
    and source.organization_id = revision.organization_id
  where revision.id = revision_id
    and revision.status = 'processing'
    and source.source_type = 'url'
  for update of revision, source;

  if revision_organization_id is null then
    raise exception 'processing web knowledge revision not found'
      using errcode = 'P0002';
  end if;

  update public.knowledge_revisions
  set
    title = extracted_title,
    body = extracted_body,
    processing_stage = 'forming_content_units'
  where id = revision_id
    and organization_id = revision_organization_id;
end;
$$;

create or replace function public.create_web_knowledge_source(
  source_url text,
  placeholder_title text
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
  source_url := trim(source_url);
  placeholder_title := trim(placeholder_title);

  if source_url is null
    or char_length(source_url) > 2048
    or source_url !~* '^https?://' then
    raise exception 'web knowledge source URL must use HTTP or HTTPS'
      using errcode = '22023';
  end if;

  if placeholder_title is null
    or char_length(placeholder_title) not between 1 and 160 then
    raise exception 'web knowledge source placeholder title is required'
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
    placeholder_title,
    'url',
    source_url,
    'processing'
  )
  returning id into knowledge_source_id;

  insert into public.knowledge_revisions (
    organization_id,
    knowledge_source_id,
    title,
    body,
    original_url,
    processing_stage
  ) values (
    current_organization_id,
    knowledge_source_id,
    placeholder_title,
    '',
    source_url,
    'fetching'
  )
  returning id into knowledge_revision_id;

  return next;
end;
$$;

create or replace function public.retry_knowledge_source(target_source_id uuid)
returns table (
  knowledge_revision_id uuid,
  source_type text,
  original_url text
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  source_organization_id uuid;
  saved_revision public.knowledge_revisions%rowtype;
begin
  select source.organization_id, source.source_type, source.original_url
  into source_organization_id, source_type, original_url
  from public.knowledge_sources as source
  where source.id = target_source_id
    and source.enabled
    and source.status <> 'processing'
    and source.failure_reason is not null
    and (select private.is_organization_member(source.organization_id))
  for update;

  if source_organization_id is null then
    raise exception 'retryable knowledge source not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.knowledge_revisions as revision
    where revision.organization_id = source_organization_id
      and revision.knowledge_source_id = target_source_id
      and revision.status = 'processing'
  ) then
    raise exception 'knowledge source already has a processing revision'
      using errcode = '55000';
  end if;

  select revision.*
  into saved_revision
  from public.knowledge_revisions as revision
  where revision.organization_id = source_organization_id
    and revision.knowledge_source_id = target_source_id
    and revision.status = 'failed'
  order by revision.created_at desc
  limit 1;

  if saved_revision.id is null then
    raise exception 'failed knowledge revision not found'
      using errcode = 'P0002';
  end if;

  insert into public.knowledge_revisions (
    organization_id,
    knowledge_source_id,
    title,
    body,
    original_url,
    processing_stage
  ) values (
    saved_revision.organization_id,
    saved_revision.knowledge_source_id,
    saved_revision.title,
    saved_revision.body,
    saved_revision.original_url,
    case
      when source_type = 'url' then 'fetching'
      else 'forming_content_units'
    end
  )
  returning id into knowledge_revision_id;

  update public.knowledge_sources
  set
    status = case
      when current_revision_id is null then 'processing'
      else 'available'
    end,
    failure_reason = null,
    updated_at = now()
  where id = target_source_id
    and organization_id = source_organization_id;

  return next;
end;
$$;

create or replace function public.set_knowledge_source_enabled(
  target_source_id uuid,
  source_enabled boolean
)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  source_current_revision_id uuid;
  source_status text;
  source_organization_id uuid;
begin
  select source.current_revision_id, source.status, source.organization_id
  into source_current_revision_id, source_status, source_organization_id
  from public.knowledge_sources as source
  where source.id = target_source_id
    and (select private.is_organization_member(source.organization_id))
  for update;

  if source_status is null then
    raise exception 'knowledge source not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.knowledge_revisions as revision
    where revision.organization_id = source_organization_id
      and revision.knowledge_source_id = target_source_id
      and revision.status = 'processing'
  ) then
    raise exception 'processing knowledge source cannot change availability'
      using errcode = '55000';
  end if;

  if source_enabled then
    source_status := case
      when source_current_revision_id is null then 'failed'
      else 'available'
    end;
  else
    source_status := 'disabled';
  end if;

  update public.knowledge_sources
  set
    enabled = source_enabled,
    status = source_status,
    updated_at = now()
  where id = target_source_id;

  return source_status;
end;
$$;
