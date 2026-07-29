insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  phone,
  phone_change,
  phone_change_token,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'admin@groundeddesk.local',
  null,
  '2026-01-01 00:00:00+00',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"演示管理员"}'::jsonb,
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00',
  false,
  false
);

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  id
) values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000001',
    'email', 'admin@groundeddesk.local',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00',
  '00000000-0000-4000-8000-000000000011'
);

insert into public.organizations (id, name, slug, created_at)
values (
  '00000000-0000-4000-8000-000000000101',
  'GroundedDesk 演示组织',
  'groundeddesk-demo',
  '2026-01-01 00:00:00+00'
);

insert into public.organization_members (
  organization_id,
  user_id,
  role,
  created_at
) values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'administrator',
  '2026-01-01 00:00:00+00'
);

insert into public.assistants (
  id,
  organization_id,
  name,
  welcome_message,
  service_scope,
  tone,
  human_contact_label,
  human_contact_url,
  status,
  public_id,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '演示网站服务助手',
  '你好，我是 GroundedDesk 演示助手。你可以询问服务范围和支持方式。',
  '根据演示组织已启用的知识来源回答服务相关问题。',
  'professional',
  '联系人工',
  'mailto:admin@groundeddesk.local',
  'draft',
  null,
  '2026-01-01 00:00:00+00',
  '2026-01-01 00:00:00+00'
);
