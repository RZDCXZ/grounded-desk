create function private.is_valid_assistant_contact_url(candidate text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_candidate text := btrim(candidate);
  candidate_host text;
  candidate_port text;
begin
  if
    normalized_candidate is null
    or char_length(normalized_candidate) not between 1 and 2048
    or normalized_candidate
      !~* '^(https?://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::[0-9]{1,5})?(?:[/?#][^[:space:]]*)?|mailto:[^[:space:]@]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\?[^[:space:]]*)?)$'
  then
    return false;
  end if;

  candidate_host := substring(
    lower(normalized_candidate)
    from '^https?://([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)(?::[0-9]{1,5})?(?:[/?#]|$)'
  );

  if candidate_host is not null and candidate_host !~ '[a-z]' then
    return false;
  end if;

  candidate_port := substring(
    lower(normalized_candidate)
    from '^https?://[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*:([0-9]{1,5})(?:[/?#]|$)'
  );

  return
    candidate_port is null
    or candidate_port::integer between 0 and 65535;
end;
$$;

revoke all
on function private.is_valid_assistant_contact_url(text)
from public;

grant execute
on function private.is_valid_assistant_contact_url(text)
to authenticated;

alter table public.assistants
add constraint assistants_name_content_check
check (char_length(btrim(name)) between 1 and 80),
add constraint assistants_welcome_message_content_check
check (char_length(btrim(welcome_message)) between 1 and 500),
add constraint assistants_service_scope_content_check
check (char_length(btrim(service_scope)) between 1 and 1000),
add constraint assistants_human_contact_label_content_check
check (char_length(btrim(human_contact_label)) between 1 and 80),
add constraint assistants_human_contact_url_content_check
check (private.is_valid_assistant_contact_url(human_contact_url));

create function public.update_assistant_business_configuration(
  assistant_name text,
  assistant_welcome_message text,
  assistant_service_scope text,
  assistant_tone text,
  assistant_human_contact_label text,
  assistant_human_contact_url text
)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  current_organization_id uuid;
  updated_assistant_id uuid;
begin
  assistant_name := btrim(assistant_name);
  assistant_welcome_message := btrim(assistant_welcome_message);
  assistant_service_scope := btrim(assistant_service_scope);
  assistant_tone := btrim(assistant_tone);
  assistant_human_contact_label := btrim(assistant_human_contact_label);
  assistant_human_contact_url := btrim(assistant_human_contact_url);

  if assistant_name = '' then
    raise exception 'assistant name is required' using errcode = '22023';
  end if;

  if char_length(assistant_name) > 80 then
    raise exception 'assistant name is too long' using errcode = '22023';
  end if;

  if assistant_welcome_message = '' then
    raise exception 'assistant welcome message is required'
      using errcode = '22023';
  end if;

  if char_length(assistant_welcome_message) > 500 then
    raise exception 'assistant welcome message is too long'
      using errcode = '22023';
  end if;

  if assistant_service_scope = '' then
    raise exception 'assistant service scope is required'
      using errcode = '22023';
  end if;

  if char_length(assistant_service_scope) > 1000 then
    raise exception 'assistant service scope is too long'
      using errcode = '22023';
  end if;

  if assistant_tone not in ('professional', 'friendly', 'concise') then
    raise exception 'assistant tone is invalid' using errcode = '22023';
  end if;

  if assistant_human_contact_label = '' then
    raise exception 'assistant human contact label is required'
      using errcode = '22023';
  end if;

  if char_length(assistant_human_contact_label) > 80 then
    raise exception 'assistant human contact label is too long'
      using errcode = '22023';
  end if;

  if not coalesce(
    private.is_valid_assistant_contact_url(assistant_human_contact_url),
    false
  ) then
    raise exception 'assistant human contact URL is invalid'
      using errcode = '22023';
  end if;

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
    name = assistant_name,
    welcome_message = assistant_welcome_message,
    service_scope = assistant_service_scope,
    tone = assistant_tone,
    human_contact_label = assistant_human_contact_label,
    human_contact_url = assistant_human_contact_url,
    updated_at = now()
  where organization_id = current_organization_id
  returning id into updated_assistant_id;

  if updated_assistant_id is null then
    raise exception 'assistant not found' using errcode = 'P0002';
  end if;

  return updated_assistant_id;
end;
$$;

revoke all
on function public.update_assistant_business_configuration(
  text,
  text,
  text,
  text,
  text,
  text
)
from public;

grant execute
on function public.update_assistant_business_configuration(
  text,
  text,
  text,
  text,
  text,
  text
)
to authenticated;
