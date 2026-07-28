alter function public.complete_manual_knowledge_revision(uuid, jsonb)
rename to complete_knowledge_revision;

alter function public.fail_manual_knowledge_revision(uuid, text)
rename to fail_knowledge_revision;

create function public.create_web_knowledge_source(
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
    original_url
  ) values (
    current_organization_id,
    knowledge_source_id,
    placeholder_title,
    '',
    source_url
  )
  returning id into knowledge_revision_id;

  return next;
end;
$$;

revoke all
on function public.create_web_knowledge_source(text, text)
from public;
grant execute
on function public.create_web_knowledge_source(text, text)
to authenticated;

create function public.prepare_web_knowledge_revision(
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
    body = extracted_body
  where id = revision_id
    and organization_id = revision_organization_id;
end;
$$;

revoke all
on function public.prepare_web_knowledge_revision(uuid, text, text)
from public;
grant execute
on function public.prepare_web_knowledge_revision(uuid, text, text)
to authenticated;

create function public.complete_web_knowledge_revision(
  revision_id uuid,
  revision_content_units jsonb
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform public.complete_knowledge_revision(
    revision_id,
    revision_content_units
  );

  update public.knowledge_sources as source
  set
    title = revision.title,
    updated_at = now()
  from public.knowledge_revisions as revision
  where revision.id = revision_id
    and source.id = revision.knowledge_source_id
    and source.organization_id = revision.organization_id
    and source.source_type = 'url'
    and source.current_revision_id = revision.id;

  if not found then
    raise exception 'completed web knowledge revision not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all
on function public.complete_web_knowledge_revision(uuid, jsonb)
from public;
grant execute
on function public.complete_web_knowledge_revision(uuid, jsonb)
to authenticated;
