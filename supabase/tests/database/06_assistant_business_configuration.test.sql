begin;

select plan(16);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.update_assistant_business_configuration(
      '  演示业务顾问  ',
      '  欢迎咨询演示业务。  ',
      '  仅回答演示业务的服务范围与支持方式。  ',
      'friendly',
      '  联系业务团队  ',
      '  https://example.com/contact  '
    )
  $$,
  'administrator can save assistant business configuration'
);

select results_eq(
  $$
    select
      name,
      welcome_message,
      service_scope,
      tone,
      human_contact_label,
      human_contact_url
    from public.assistants
  $$,
  $$
    values (
      '演示业务顾问',
      '欢迎咨询演示业务。',
      '仅回答演示业务的服务范围与支持方式。',
      'friendly',
      '联系业务团队',
      'https://example.com/contact'
    )
  $$,
  'saved configuration is trimmed and readable after re-entry'
);

select results_eq(
  $$ select status from public.assistants $$,
  array['draft'],
  'saving business configuration does not publish a draft assistant'
);

select results_eq(
  $$ select public_id::text from public.assistants $$,
  array['00000000-0000-4000-8000-000000000301'],
  'saving business configuration does not replace the assistant public identifier'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '',
      '欢迎咨询演示业务。',
      '仅回答演示业务的服务范围与支持方式。',
      'professional',
      '联系业务团队',
      'https://example.com/contact'
    )
  $$,
  '22023',
  'assistant name is required',
  'blank assistant name is rejected'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '不应保存的名称',
      '',
      '仅回答演示业务的服务范围与支持方式。',
      'professional',
      '联系业务团队',
      'https://example.com/contact'
    )
  $$,
  '22023',
  'assistant welcome message is required',
  'blank welcome message is rejected'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '不应保存的名称',
      '欢迎咨询演示业务。',
      '',
      'professional',
      '联系业务团队',
      'https://example.com/contact'
    )
  $$,
  '22023',
  'assistant service scope is required',
  'blank service scope is rejected'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '不应保存的名称',
      '欢迎咨询演示业务。',
      '仅回答演示业务的服务范围与支持方式。',
      'playful',
      '联系业务团队',
      'https://example.com/contact'
    )
  $$,
  '22023',
  'assistant tone is invalid',
  'unsupported tone is rejected'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '不应保存的名称',
      '欢迎咨询演示业务。',
      '仅回答演示业务的服务范围与支持方式。',
      'concise',
      '',
      'https://example.com/contact'
    )
  $$,
  '22023',
  'assistant human contact label is required',
  'blank human contact label is rejected'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '不应保存的名称',
      '欢迎咨询演示业务。',
      '仅回答演示业务的服务范围与支持方式。',
      'concise',
      '联系业务团队',
      'javascript:alert(1)'
    )
  $$,
  '22023',
  'assistant human contact URL is invalid',
  'unsafe human contact URL is rejected'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '不应保存的名称',
      '欢迎咨询演示业务。',
      '仅回答演示业务的服务范围与支持方式。',
      'concise',
      '联系业务团队',
      'http://%'
    )
  $$,
  '22023',
  'assistant human contact URL is invalid',
  'malformed HTTP contact URL is rejected'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '不应保存的名称',
      '欢迎咨询演示业务。',
      '仅回答演示业务的服务范围与支持方式。',
      'concise',
      '联系业务团队',
      'https://example.com:99999'
    )
  $$,
  '22023',
  'assistant human contact URL is invalid',
  'out-of-range contact URL port is rejected'
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '不应保存的名称',
      '欢迎咨询演示业务。',
      '仅回答演示业务的服务范围与支持方式。',
      'concise',
      '联系业务团队',
      'https://[:::]'
    )
  $$,
  '22023',
  'assistant human contact URL is invalid',
  'malformed IPv6 contact URL is rejected'
);

select results_eq(
  $$ select name from public.assistants $$,
  array['演示业务顾问'],
  'rejected updates preserve the previously saved configuration'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '越权名称',
      '越权欢迎语',
      '越权服务范围',
      'professional',
      '越权联系',
      'https://example.com/contact'
    )
  $$,
  '42501',
  'administrator organization not found',
  'authenticated non-member cannot update assistant configuration'
);

reset role;
set local role anon;

select throws_ok(
  $$
    select public.update_assistant_business_configuration(
      '匿名名称',
      '匿名欢迎语',
      '匿名服务范围',
      'professional',
      '匿名联系',
      'https://example.com/contact'
    )
  $$,
  '42501',
  'permission denied for function update_assistant_business_configuration',
  'anonymous role cannot update assistant configuration'
);

select * from finish();
rollback;
