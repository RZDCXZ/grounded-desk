begin;

select plan(7);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create temporary table atomic_source as
select *
from public.create_manual_knowledge_source(
  '原始服务说明',
  repeat('这是原始知识版本中持续参与回答的演示正文。', 8),
  'https://example.com/original'
);

select public.complete_knowledge_revision(
  (select knowledge_revision_id from atomic_source),
  jsonb_build_array(
    jsonb_build_object(
      'position', 0,
      'heading', '原始内容',
      'content', '原始服务说明 原始内容 这是切换前唯一参与回答的内容单元。',
      'embedding', to_jsonb(array_fill(0.01::double precision, array[1024]))
    )
  )
);

create temporary table atomic_update as
select *
from public.update_manual_knowledge_source(
  (select knowledge_source_id from atomic_source),
  '更新后的服务说明',
  repeat('这是尚未完成处理的新知识版本演示正文。', 8),
  'https://example.com/updated'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.title,
      source.status,
      source.current_revision_id = original.knowledge_revision_id,
      original_revision.status,
      replacement.status,
      replacement.processing_stage,
      (
        select count(*)::text
        from public.knowledge_revisions as available_revision
        where available_revision.knowledge_source_id = source.id
          and available_revision.status = 'available'
      )
    )
    from atomic_source as original
    cross join atomic_update as update_result
    join public.knowledge_sources as source
      on source.id = original.knowledge_source_id
    join public.knowledge_revisions as original_revision
      on original_revision.id = original.knowledge_revision_id
    join public.knowledge_revisions as replacement
      on replacement.id = update_result.knowledge_revision_id
  $$,
  array['原始服务说明|available|t|available|processing|forming_content_units|1'],
  'a processing manual update is independent while the old revision stays available'
);

select public.advance_knowledge_revision_stage(
  (select knowledge_revision_id from atomic_update),
  'vectorizing'
);

select results_eq(
  $$
    select revision.processing_stage
    from atomic_update as update_result
    join public.knowledge_revisions as revision
      on revision.id = update_result.knowledge_revision_id
  $$,
  array['vectorizing'],
  'the replacement revision exposes its current processing stage'
);

select public.complete_knowledge_revision(
  (select knowledge_revision_id from atomic_update),
  jsonb_build_array(
    jsonb_build_object(
      'position', 0,
      'heading', '更新内容',
      'content', '更新后的服务说明 更新内容 这是切换后唯一参与回答的新内容单元。',
      'embedding', to_jsonb(array_fill(0.02::double precision, array[1024]))
    )
  )
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.title,
      source.original_url,
      source.current_revision_id = update_result.knowledge_revision_id,
      original_revision.status,
      replacement.status,
      (
        select count(*)::text
        from public.knowledge_revisions as available_revision
        where available_revision.knowledge_source_id = source.id
          and available_revision.status = 'available'
      ),
      (
        select string_agg(unit.content, ',')
        from public.content_units as unit
        where unit.knowledge_revision_id = source.current_revision_id
      )
    )
    from atomic_source as original
    cross join atomic_update as update_result
    join public.knowledge_sources as source
      on source.id = original.knowledge_source_id
    join public.knowledge_revisions as original_revision
      on original_revision.id = original.knowledge_revision_id
    join public.knowledge_revisions as replacement
      on replacement.id = update_result.knowledge_revision_id
  $$,
  array[
    '更新后的服务说明|https://example.com/updated|t|superseded|available|1|更新后的服务说明 更新内容 这是切换后唯一参与回答的新内容单元。'
  ],
  'completion atomically replaces metadata and the complete current revision without mixing units'
);

create temporary table failing_update as
select *
from public.update_manual_knowledge_source(
  (select knowledge_source_id from atomic_source),
  '不会生效的服务说明',
  repeat('这是会在向量化阶段失败的新知识版本演示正文。', 8),
  null
);

select throws_ok(
  $$
    select *
    from public.update_manual_knowledge_source(
      (select knowledge_source_id from atomic_source),
      '并发重复更新',
      repeat('同一知识来源已有处理中的版本时不应再创建另一个版本。', 8),
      null
    )
  $$,
  '55000',
  'knowledge source already has a processing revision',
  'a duplicate update cannot create a second processing revision'
);

select public.fail_knowledge_revision(
  (select knowledge_revision_id from failing_update),
  '向量服务暂时不可用，请稍后重试。'
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.status,
      source.current_revision_id = successful_update.knowledge_revision_id,
      failed_revision.status,
      failed_revision.failure_reason,
      (
        select count(*)::text
        from public.knowledge_revisions as available_revision
        where available_revision.knowledge_source_id = source.id
          and available_revision.status = 'available'
      )
    )
    from atomic_source as original
    cross join atomic_update as successful_update
    cross join failing_update as failed_update
    join public.knowledge_sources as source
      on source.id = original.knowledge_source_id
    join public.knowledge_revisions as failed_revision
      on failed_revision.id = failed_update.knowledge_revision_id
  $$,
  array[
    'available|t|failed|向量服务暂时不可用，请稍后重试。|1'
  ],
  'a failed replacement retains its reason and needs no rollback of the current revision'
);

select throws_ok(
  $$
    update public.knowledge_revisions
    set status = 'available'
    where id = (select knowledge_revision_id from atomic_source)
  $$,
  '23505',
  'duplicate key value violates unique constraint "knowledge_revisions_one_available_per_source_idx"',
  'the database enforces one available revision per knowledge source'
);

create temporary table atomic_web_source as
select *
from public.create_web_knowledge_source(
  'https://docs.example.com/atomic',
  'docs.example.com'
);

select public.prepare_web_knowledge_revision(
  (select knowledge_revision_id from atomic_web_source),
  '原始网页说明',
  repeat('这是重新抓取前持续参与回答的网页知识正文。', 8)
);

select public.complete_web_knowledge_revision(
  (select knowledge_revision_id from atomic_web_source),
  jsonb_build_array(
    jsonb_build_object(
      'position', 0,
      'heading', '网页内容',
      'content', '原始网页说明 网页内容 这是网页来源的完整内容单元。',
      'embedding', to_jsonb(array_fill(0.03::double precision, array[1024]))
    )
  )
);

create temporary table atomic_web_refresh as
select *
from public.refresh_web_knowledge_source(
  (select knowledge_source_id from atomic_web_source)
);

select results_eq(
  $$
    select concat_ws(
      '|',
      source.status,
      source.current_revision_id = original.knowledge_revision_id,
      refresh.original_url,
      replacement.status,
      replacement.processing_stage
    )
    from atomic_web_source as original
    cross join atomic_web_refresh as refresh
    join public.knowledge_sources as source
      on source.id = original.knowledge_source_id
    join public.knowledge_revisions as replacement
      on replacement.id = refresh.knowledge_revision_id
  $$,
  array[
    'available|t|https://docs.example.com/atomic|processing|fetching'
  ],
  'reprocessing a web source keeps the current revision available while fetching'
);

select * from finish();
rollback;
