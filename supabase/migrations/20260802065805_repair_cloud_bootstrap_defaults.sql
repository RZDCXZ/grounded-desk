alter table public.organizations
alter column id set default gen_random_uuid();

alter table public.assistants
alter column id set default gen_random_uuid();
