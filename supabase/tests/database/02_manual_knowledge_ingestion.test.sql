begin;

select plan(9);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create temporary table created_manual_source as
select *
from public.create_manual_knowledge_source(
  '演示服务说明',
  repeat('这是用于验证手工知识来源处理状态的演示正文。', 8),
  'https://example.com/service'
);

select results_eq(
  $$
    select source.status
    from public.knowledge_sources as source
    join created_manual_source as created
      on created.knowledge_source_id = source.id
  $$,
  array['processing'],
  'administrator creates a manual knowledge source in processing state'
);

select throws_ok(
  $$
    select *
    from public.create_manual_knowledge_source(
      '   ',
      repeat('标题为空时不应创建知识来源。', 8),
      null
    )
  $$,
  '22023',
  'knowledge source title is required',
  'manual knowledge source requires a non-empty title'
);

select public.complete_knowledge_revision(
  (select knowledge_revision_id from created_manual_source),
  jsonb_build_array(
    jsonb_build_object(
      'position', 0,
      'heading', '服务范围',
      'content', '演示服务说明 服务范围 这是一个可以被检索的完整内容单元。',
      'embedding', to_jsonb(array_fill(0.01::double precision, array[1024]))
    )
  )
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.status,
      revision.status,
      (
        select count(*)::text
        from public.content_units as unit
        where unit.knowledge_revision_id = revision.id
      ),
      (
        select extensions.vector_dims(unit.embedding)::text
        from public.content_units as unit
        where unit.knowledge_revision_id = revision.id
        limit 1
      )
    )
    from created_manual_source as created
    join public.knowledge_sources as source
      on source.id = created.knowledge_source_id
    join public.knowledge_revisions as revision
      on revision.id = source.current_revision_id
  $$,
  array['available|available|1|1024'],
  'completion atomically exposes a full revision with content units and vectors'
);

insert into public.knowledge_revisions (
  id,
  organization_id,
  knowledge_source_id,
  title,
  body
) values (
  '00000000-0000-4000-8000-000000000803',
  '00000000-0000-4000-8000-000000000101',
  (select knowledge_source_id from created_manual_source),
  '演示服务说明更新',
  repeat('这是一次会处理失败的更新正文。', 8)
);

update public.knowledge_sources
set status = 'processing'
where id = (select knowledge_source_id from created_manual_source);

select public.fail_knowledge_revision(
  '00000000-0000-4000-8000-000000000803',
  '向量服务暂时不可用，请稍后重试。'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.status,
      source.current_revision_id = created.knowledge_revision_id,
      failed_revision.status
    )
    from created_manual_source as created
    join public.knowledge_sources as source
      on source.id = created.knowledge_source_id
    join public.knowledge_revisions as failed_revision
      on failed_revision.id = '00000000-0000-4000-8000-000000000803'
  $$,
  array['available|t|failed'],
  'failed refresh keeps the previous complete knowledge revision available'
);

create temporary table failed_manual_source as
select *
from public.create_manual_knowledge_source(
  '无效演示内容',
  repeat('！', 100),
  null
);

select public.fail_knowledge_revision(
  (select knowledge_revision_id from failed_manual_source),
  '正文无法形成有效内容单元，请补充清晰的标题和段落内容后重试。'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.status,
      revision.status,
      case when source.current_revision_id is null then 'true' else 'false' end,
      (
        select count(*)::text
        from public.content_units as unit
        where unit.knowledge_revision_id = revision.id
      ),
      source.failure_reason
    )
    from failed_manual_source as failed
    join public.knowledge_sources as source
      on source.id = failed.knowledge_source_id
    join public.knowledge_revisions as revision
      on revision.id = failed.knowledge_revision_id
  $$,
  array[
    'failed|failed|true|0|正文无法形成有效内容单元，请补充清晰的标题和段落内容后重试。'
  ],
  'failed processing exposes no partial knowledge revision or content units'
);

reset role;

insert into public.organizations (id, name, slug)
values (
  '00000000-0000-4000-8000-000000000102',
  '其他组织',
  'other-organization'
);

insert into public.knowledge_sources (
  id,
  organization_id,
  title,
  source_type,
  status
) values (
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000102',
  '其他组织知识来源',
  'manual',
  'processing'
);

insert into public.knowledge_revisions (
  id,
  organization_id,
  knowledge_source_id,
  title,
  body,
  status,
  completed_at
) values (
  '00000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000402',
  '其他组织知识来源',
  repeat('其他组织的完整知识正文。', 10),
  'available',
  now()
);

insert into public.content_units (
  id,
  organization_id,
  knowledge_source_id,
  knowledge_revision_id,
  position,
  content,
  embedding
) values (
  '00000000-0000-4000-8000-000000000902',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000802',
  0,
  '其他组织的内容单元',
  array_fill(0.02::real, array[1024])::extensions.vector(1024)
);

update public.knowledge_sources
set
  status = 'available',
  current_revision_id = '00000000-0000-4000-8000-000000000802'
where id = '00000000-0000-4000-8000-000000000402';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.knowledge_sources
        where id = '00000000-0000-4000-8000-000000000402'),
      (select count(*) from public.knowledge_revisions
        where id = '00000000-0000-4000-8000-000000000802'),
      (select count(*) from public.content_units
        where id = '00000000-0000-4000-8000-000000000902')
    )
  $$,
  array['0|0|0'],
  'administrator cannot read another organization source or derived data'
);

select is_empty(
  $$
    update public.knowledge_sources
    set title = '越权修改'
    where id = '00000000-0000-4000-8000-000000000402'
    returning id
  $$,
  'administrator cannot modify another organization knowledge source'
);

reset role;
set local role anon;

select throws_ok(
  $$ select id from public.knowledge_revisions $$,
  '42501',
  'permission denied for table knowledge_revisions',
  'anonymous role cannot read knowledge revisions directly'
);

select throws_ok(
  $$ select id from public.content_units $$,
  '42501',
  'permission denied for table content_units',
  'anonymous role cannot read content units and vectors directly'
);

select * from finish();
rollback;
