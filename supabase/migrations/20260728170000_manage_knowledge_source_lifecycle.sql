create function public.set_knowledge_source_enabled(
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
begin
  select source.current_revision_id, source.status
  into source_current_revision_id, source_status
  from public.knowledge_sources as source
  where source.id = target_source_id
    and (select private.is_organization_member(source.organization_id))
  for update;

  if source_status is null then
    raise exception 'knowledge source not found'
      using errcode = 'P0002';
  end if;

  if source_status = 'processing' then
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

revoke all
on function public.set_knowledge_source_enabled(uuid, boolean)
from public;
grant execute
on function public.set_knowledge_source_enabled(uuid, boolean)
to authenticated;

create function public.retry_knowledge_source(target_source_id uuid)
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
    original_url
  ) values (
    saved_revision.organization_id,
    saved_revision.knowledge_source_id,
    saved_revision.title,
    saved_revision.body,
    saved_revision.original_url
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

revoke all
on function public.retry_knowledge_source(uuid)
from public;
grant execute
on function public.retry_knowledge_source(uuid)
to authenticated;

create function public.delete_knowledge_source(target_source_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  delete from public.knowledge_sources as source
  where source.id = target_source_id
    and (select private.is_organization_member(source.organization_id));

  if not found then
    raise exception 'knowledge source not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all
on function public.delete_knowledge_source(uuid)
from public;
grant execute
on function public.delete_knowledge_source(uuid)
to authenticated;
