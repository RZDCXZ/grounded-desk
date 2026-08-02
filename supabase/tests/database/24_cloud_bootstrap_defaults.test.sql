begin;

select plan(2);

select col_has_default(
  'public',
  'organizations',
  'id',
  'cloud bootstrap can create an organization without supplying an id'
);

select col_has_default(
  'public',
  'assistants',
  'id',
  'cloud bootstrap can create an assistant without supplying an id'
);

select * from finish();
rollback;
