grant usage on schema private to service_role;

grant execute
on function private.is_valid_assistant_contact_url(text)
to service_role;
