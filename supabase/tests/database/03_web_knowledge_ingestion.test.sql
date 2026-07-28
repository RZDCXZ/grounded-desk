begin;

select plan(5);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create temporary table created_web_source as
select *
from public.create_web_knowledge_source(
  'https://docs.example.com/service',
  'docs.example.com'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.source_type,
      source.status,
      source.original_url,
      revision.status,
      revision.body
    )
    from created_web_source as created
    join public.knowledge_sources as source
      on source.id = created.knowledge_source_id
    join public.knowledge_revisions as revision
      on revision.id = created.knowledge_revision_id
  $$,
  array['url|processing|https://docs.example.com/service|processing|'],
  'administrator creates a web knowledge source in processing state'
);

select public.prepare_web_knowledge_revision(
  (select knowledge_revision_id from created_web_source),
  '演示网页服务说明',
  repeat('这是从公开网页提取并保留的演示主要正文。', 8)
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.title,
      revision.title,
      revision.body = repeat('这是从公开网页提取并保留的演示主要正文。', 8)
    )
    from created_web_source as created
    join public.knowledge_sources as source
      on source.id = created.knowledge_source_id
    join public.knowledge_revisions as revision
      on revision.id = created.knowledge_revision_id
  $$,
  array['docs.example.com|演示网页服务说明|t'],
  'preparing a web revision preserves extracted content without exposing its title'
);

select public.complete_web_knowledge_revision(
  (select knowledge_revision_id from created_web_source),
  jsonb_build_array(
    jsonb_build_object(
      'position', 0,
      'heading', '服务范围',
      'content', '演示网页服务说明 服务范围 这是公开网页形成的完整内容单元。',
      'embedding', to_jsonb(array_fill(0.01::double precision, array[1024]))
    )
  )
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.title,
      source.status,
      revision.status,
      source.current_revision_id = revision.id
    )
    from created_web_source as created
    join public.knowledge_sources as source
      on source.id = created.knowledge_source_id
    join public.knowledge_revisions as revision
      on revision.id = created.knowledge_revision_id
  $$,
  array['演示网页服务说明|available|available|t'],
  'web completion atomically exposes the extracted title and complete revision'
);

select throws_ok(
  $$
    select *
    from public.create_web_knowledge_source(
      'file:///etc/passwd',
      '无效来源'
    )
  $$,
  '22023',
  'web knowledge source URL must use HTTP or HTTPS',
  'web knowledge source requires an HTTP or HTTPS URL'
);

reset role;
set local role anon;

select throws_ok(
  $$
    select *
    from public.create_web_knowledge_source(
      'https://docs.example.com/private',
      '匿名来源'
    )
  $$,
  '42501',
  'permission denied for function create_web_knowledge_source',
  'anonymous role cannot create web knowledge sources'
);

select * from finish();
rollback;
