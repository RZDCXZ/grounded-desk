begin;

select plan(4);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create temporary table lifecycle_source as
select *
from public.create_manual_knowledge_source(
  '生命周期演示来源',
  repeat('这是用于验证知识来源生命周期的已保存正文。', 8),
  'https://example.com/lifecycle'
);

select public.complete_knowledge_revision(
  (select knowledge_revision_id from lifecycle_source),
  jsonb_build_array(
    jsonb_build_object(
      'position', 0,
      'heading', '服务范围',
      'content', '生命周期演示来源 服务范围 这是可检索的完整内容单元。',
      'embedding', to_jsonb(array_fill(0.01::double precision, array[1024]))
    )
  )
);

create temporary table lifecycle_before_toggle as
select
  source.current_revision_id,
  revision.body,
  count(unit.id) as content_unit_count
from lifecycle_source as created
join public.knowledge_sources as source
  on source.id = created.knowledge_source_id
join public.knowledge_revisions as revision
  on revision.id = source.current_revision_id
join public.content_units as unit
  on unit.knowledge_revision_id = revision.id
group by source.current_revision_id, revision.body;

select public.set_knowledge_source_enabled(
  (select knowledge_source_id from lifecycle_source),
  false
);

select public.set_knowledge_source_enabled(
  (select knowledge_source_id from lifecycle_source),
  true
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.enabled,
      source.status,
      source.current_revision_id = before_toggle.current_revision_id,
      revision.body = before_toggle.body,
      count(unit.id) = before_toggle.content_unit_count
    )
    from lifecycle_source as created
    cross join lifecycle_before_toggle as before_toggle
    join public.knowledge_sources as source
      on source.id = created.knowledge_source_id
    join public.knowledge_revisions as revision
      on revision.id = source.current_revision_id
    join public.content_units as unit
      on unit.knowledge_revision_id = revision.id
    group by
      source.enabled,
      source.status,
      source.current_revision_id,
      before_toggle.current_revision_id,
      revision.body,
      before_toggle.body,
      before_toggle.content_unit_count
  $$,
  array['t|available|t|t|t'],
  'disabling and enabling preserves the current knowledge revision and content units'
);

create temporary table failed_source as
select *
from public.create_manual_knowledge_source(
  '等待重试的演示来源',
  repeat('这是失败后应由系统保留并直接用于重试的正文。', 8),
  'https://example.com/retry'
);

select public.fail_knowledge_revision(
  (select knowledge_revision_id from failed_source),
  '向量服务暂时不可用，请稍后重试。'
);

create temporary table retried_source as
select *
from public.retry_knowledge_source(
  (select knowledge_source_id from failed_source)
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.status,
      source.failure_reason is null,
      retried.source_type,
      retried.original_url,
      retry_revision.status,
      retry_revision.title = failed_revision.title,
      retry_revision.body = failed_revision.body,
      retry_revision.original_url = failed_revision.original_url
    )
    from failed_source as failed
    cross join retried_source as retried
    join public.knowledge_sources as source
      on source.id = failed.knowledge_source_id
    join public.knowledge_revisions as failed_revision
      on failed_revision.id = failed.knowledge_revision_id
    join public.knowledge_revisions as retry_revision
      on retry_revision.id = retried.knowledge_revision_id
  $$,
  array[
    'processing|t|manual|https://example.com/retry|processing|t|t|t'
  ],
  'retry creates a processing revision from the saved input without re-entry'
);

insert into public.knowledge_revisions (
  id,
  organization_id,
  knowledge_source_id,
  title,
  body
) values (
  '00000000-0000-4000-8000-000000000804',
  '00000000-0000-4000-8000-000000000101',
  (select knowledge_source_id from lifecycle_source),
  '生命周期演示来源更新',
  repeat('这是失败后仍应保留当前可用版本的更新正文。', 8)
);

update public.knowledge_sources
set status = 'processing'
where id = (select knowledge_source_id from lifecycle_source);

select public.fail_knowledge_revision(
  '00000000-0000-4000-8000-000000000804',
  '向量服务暂时不可用，请稍后重试。'
);

create temporary table retried_refresh as
select *
from public.retry_knowledge_source(
  (select knowledge_source_id from lifecycle_source)
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.status,
      source.enabled,
      source.current_revision_id = before_toggle.current_revision_id,
      retry_revision.status
    )
    from lifecycle_source as created
    cross join lifecycle_before_toggle as before_toggle
    cross join retried_refresh as retried
    join public.knowledge_sources as source
      on source.id = created.knowledge_source_id
    join public.knowledge_revisions as retry_revision
      on retry_revision.id = retried.knowledge_revision_id
  $$,
  array['available|t|t|processing'],
  'retry keeps the current complete revision available while a replacement processes'
);

select public.delete_knowledge_source(
  (select knowledge_source_id from lifecycle_source)
);

select results_eq(
  $$
    select concat_ws(
      '|',
      (select count(*) from public.knowledge_sources
        where id = (select knowledge_source_id from lifecycle_source)),
      (select count(*) from public.knowledge_revisions
        where knowledge_source_id = (
          select knowledge_source_id from lifecycle_source
        )),
      (select count(*) from public.content_units
        where knowledge_source_id = (
          select knowledge_source_id from lifecycle_source
        ))
    )
  $$,
  array['0|0|0'],
  'deleting a knowledge source removes its revisions, content units, and vectors'
);

select * from finish();
rollback;
