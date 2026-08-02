begin;

select plan(12);

-- Hosted projects can grant application roles directly, so reproduce that
-- state before exercising the versioned hardening boundary.
grant execute on all functions in schema public to anon, authenticated;

select private.harden_hosted_function_privileges();

select ok(
  not has_function_privilege(
    'anon',
    'public.begin_public_conversation(uuid,text,uuid,boolean,integer,integer,boolean)',
    'EXECUTE'
  ),
  'anonymous visitors cannot invoke server-only conversation procedures'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_public_conversation(uuid,text,uuid,boolean,integer,integer,boolean)',
    'EXECUTE'
  ),
  'administrators cannot invoke server-only conversation procedures'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.begin_public_conversation(uuid,text,uuid,boolean,integer,integer,boolean)',
    'EXECUTE'
  ),
  'the privileged server can invoke server-only conversation procedures'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_recent_conversations()',
    'EXECUTE'
  ),
  'anonymous visitors cannot review conversations'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_recent_conversations()',
    'EXECUTE'
  ),
  'administrators can review conversations'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.delete_admin_conversation(uuid)',
    'EXECUTE'
  ),
  'anonymous visitors cannot delete conversations'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.delete_admin_conversation(uuid)',
    'EXECUTE'
  ),
  'administrators can delete conversations'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.harden_hosted_function_privileges()',
    'EXECUTE'
  ),
  'anonymous visitors cannot invoke privilege maintenance'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.harden_hosted_function_privileges()',
    'EXECUTE'
  ),
  'administrators cannot invoke privilege maintenance'
);

create function public.hosted_privilege_probe()
returns void
language sql
as $$ select $$;

select ok(
  not has_function_privilege(
    'anon',
    'public.hosted_privilege_probe()',
    'EXECUTE'
  ),
  'new public functions are not executable anonymously by default'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.hosted_privilege_probe()',
    'EXECUTE'
  ),
  'new public functions require an explicit administrator grant'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.hosted_privilege_probe()',
    'EXECUTE'
  ),
  'new public functions remain available to the privileged server'
);

select * from finish();
rollback;
