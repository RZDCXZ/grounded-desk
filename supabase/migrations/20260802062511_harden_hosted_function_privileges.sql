create or replace function private.harden_hosted_function_privileges()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_function record;
  service_only_function_names constant text[] := array[
    'begin_public_conversation',
    'begin_public_conversation_with_clarification_state',
    'complete_public_clarification_decision',
    'complete_public_conflict_decision',
    'complete_public_conversation',
    'complete_public_conversation_sections',
    'complete_public_multi_request_decision',
    'complete_public_single_request_decision',
    'fail_public_conversation',
    'get_public_latest_clarification_state',
    'get_public_latest_clarification_states',
    'get_published_assistant',
    'record_public_assistant_ai_call',
    'retrieve_public_assistant_content_units',
    'submit_public_quality_feedback'
  ];
begin
  for target_function in
    select
      procedure.oid,
      procedure.proname
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      target_function.oid::regprocedure
    );

    execute format(
      'grant execute on function %s to service_role',
      target_function.oid::regprocedure
    );

    if target_function.proname = any (service_only_function_names) then
      execute format(
        'revoke execute on function %s from authenticated',
        target_function.oid::regprocedure
      );
    end if;
  end loop;

  execute $default_privileges$
    alter default privileges for role postgres
    revoke execute on functions from public, anon, authenticated
  $default_privileges$;

  execute $default_privileges$
    alter default privileges for role postgres in schema public
    grant execute on functions to service_role
  $default_privileges$;
end;
$$;

revoke all
on function private.harden_hosted_function_privileges()
from public, anon, authenticated, service_role;

select private.harden_hosted_function_privileges();
