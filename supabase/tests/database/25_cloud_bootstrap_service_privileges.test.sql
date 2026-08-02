begin;

select plan(2);

select ok(
  has_schema_privilege('service_role', 'private', 'USAGE'),
  'the privileged server can use the private helper schema'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.is_valid_assistant_contact_url(text)',
    'EXECUTE'
  ),
  'the privileged server can satisfy assistant contact constraints'
);

select * from finish();
rollback;
