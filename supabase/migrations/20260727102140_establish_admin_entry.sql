create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role = 'administrator'),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members
      where organization_id = target_organization_id
        and user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_organization_member(uuid) from public;
grant execute on function private.is_organization_member(uuid) to authenticated;

create table public.assistants (
  id uuid primary key,
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  welcome_message text not null,
  service_scope text not null,
  tone text not null default 'professional'
    check (tone in ('professional', 'friendly', 'concise')),
  human_contact_label text not null,
  human_contact_url text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'offline')),
  public_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('url', 'manual')),
  status text not null default 'processing'
    check (status in ('processing', 'available', 'failed', 'disabled')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid not null,
  visitor_session_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (assistant_id, organization_id)
    references public.assistants(id, organization_id)
    on delete cascade
);

create table public.unresolved_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid,
  question text not null,
  trigger_type text not null check (trigger_type in ('grounded_refusal', 'negative_feedback')),
  status text not null default 'pending' check (status in ('pending', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (conversation_id, organization_id)
    references public.conversations(id, organization_id)
    on delete cascade
);

create index organization_members_user_id_idx
on public.organization_members(user_id);

create index knowledge_sources_organization_status_idx
on public.knowledge_sources(organization_id, status, enabled);

create index conversations_organization_created_at_idx
on public.conversations(organization_id, created_at desc);

create index conversations_assistant_organization_idx
on public.conversations(assistant_id, organization_id);

create index unresolved_questions_organization_status_idx
on public.unresolved_questions(organization_id, status);

create index unresolved_questions_conversation_organization_idx
on public.unresolved_questions(conversation_id, organization_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.assistants enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.conversations enable row level security;
alter table public.unresolved_questions enable row level security;

create policy "members can read their organization"
on public.organizations
for select
to authenticated
using ((select private.is_organization_member(id)));

create policy "members can read organization memberships"
on public.organization_members
for select
to authenticated
using ((select private.is_organization_member(organization_id)));

create policy "members can manage assistants"
on public.assistants
for all
to authenticated
using ((select private.is_organization_member(organization_id)))
with check ((select private.is_organization_member(organization_id)));

create policy "members can manage knowledge sources"
on public.knowledge_sources
for all
to authenticated
using ((select private.is_organization_member(organization_id)))
with check ((select private.is_organization_member(organization_id)));

create policy "members can manage conversations"
on public.conversations
for all
to authenticated
using ((select private.is_organization_member(organization_id)))
with check ((select private.is_organization_member(organization_id)));

create policy "members can manage unresolved questions"
on public.unresolved_questions
for all
to authenticated
using ((select private.is_organization_member(organization_id)))
with check ((select private.is_organization_member(organization_id)));

revoke all on table public.organizations from anon;
revoke all on table public.organization_members from anon;
revoke all on table public.assistants from anon;
revoke all on table public.knowledge_sources from anon;
revoke all on table public.conversations from anon;
revoke all on table public.unresolved_questions from anon;

grant select on table public.organizations to authenticated;
grant select on table public.organization_members to authenticated;
grant select, update on table public.assistants to authenticated;
grant select, insert, update, delete on table public.knowledge_sources to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.unresolved_questions to authenticated;
