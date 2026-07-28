begin;

select plan(8);

insert into public.knowledge_sources (
  id,
  organization_id,
  title,
  source_type,
  status,
  enabled,
  original_url
) values
  (
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000101',
    '可用服务说明',
    'manual',
    'available',
    true,
    'https://example.com/services'
  ),
  (
    '00000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000101',
    '已停用服务说明',
    'manual',
    'disabled',
    false,
    'https://example.com/disabled'
  );

insert into public.knowledge_revisions (
  id,
  organization_id,
  knowledge_source_id,
  title,
  body,
  original_url,
  status
) values
  (
    '00000000-0000-4000-8000-000000000711',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000701',
    '可用服务说明',
    '当前可用版本正文。',
    'https://example.com/services',
    'available'
  ),
  (
    '00000000-0000-4000-8000-000000000712',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000701',
    '旧服务说明',
    '不应参与回答的旧版本正文。',
    'https://example.com/old',
    'processing'
  ),
  (
    '00000000-0000-4000-8000-000000000713',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000702',
    '已停用服务说明',
    '不应参与回答的停用正文。',
    'https://example.com/disabled',
    'available'
  );

update public.knowledge_sources
set current_revision_id = case id
  when '00000000-0000-4000-8000-000000000701'
    then '00000000-0000-4000-8000-000000000711'::uuid
  else '00000000-0000-4000-8000-000000000713'::uuid
end
where id in (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000702'
);

insert into public.content_units (
  id,
  organization_id,
  knowledge_source_id,
  knowledge_revision_id,
  position,
  heading,
  content,
  embedding
) values
  (
    '00000000-0000-4000-8000-000000000721',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000711',
    0,
    '当前说明',
    '当前可用版本正文。',
    array_prepend(1::real, array_fill(0::real, array[1023]))
      ::extensions.vector(1024)
  ),
  (
    '00000000-0000-4000-8000-000000000722',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000712',
    0,
    '旧说明',
    '不应参与回答的旧版本正文。',
    array_prepend(1::real, array_fill(0::real, array[1023]))
      ::extensions.vector(1024)
  ),
  (
    '00000000-0000-4000-8000-000000000723',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000713',
    0,
    '停用说明',
    '不应参与回答的停用正文。',
    array_prepend(1::real, array_fill(0::real, array[1023]))
      ::extensions.vector(1024)
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select *
    from public.retrieve_available_content_units(
      array_prepend(1::real, array_fill(0::real, array[1023]))
        ::extensions.vector(1024),
      20
    )
    where knowledge_source_id in (
      '00000000-0000-4000-8000-000000000701',
      '00000000-0000-4000-8000-000000000702'
    )
  $$,
  'administrator can retrieve answer candidates'
);

select results_eq(
  $$
    select content_unit_id::text
    from public.retrieve_available_content_units(
      array_prepend(1::real, array_fill(0::real, array[1023]))
        ::extensions.vector(1024),
      20
    )
    where knowledge_source_id in (
      '00000000-0000-4000-8000-000000000701',
      '00000000-0000-4000-8000-000000000702'
    )
  $$,
  array['00000000-0000-4000-8000-000000000721'],
  'retrieval only returns enabled current revisions in the administrator organization'
);

select is(
  (
    select count(*)
    from public.retrieve_available_content_units(
      array_prepend(1::real, array_fill(0::real, array[1023]))
        ::extensions.vector(1024),
      1
    )
  ),
  1::bigint,
  'retrieval enforces its candidate limit'
);

select lives_ok(
  $$
    insert into public.ai_call_logs (
      organization_id,
      call_type,
      provider,
      model,
      input_tokens,
      output_tokens,
      total_tokens,
      duration_ms,
      outcome,
      error_type,
      trace_id
    ) values (
      '00000000-0000-4000-8000-000000000101',
      'answer',
      'deepseek',
      'deepseek-v4-flash',
      31,
      22,
      53,
      19,
      'success',
      null,
      'answer-trace'
    )
  $$,
  'administrator can record minimal provider call metadata'
);

select results_eq(
  $$
    select
      provider,
      model,
      input_tokens,
      output_tokens,
      total_tokens,
      duration_ms,
      outcome,
      error_type,
      trace_id
    from public.ai_call_logs
    where trace_id = 'answer-trace'
  $$,
  $$
    values (
      'deepseek',
      'deepseek-v4-flash',
      31,
      22,
      53,
      19,
      'success',
      null::text,
      'answer-trace'
    )
  $$,
  'provider logs expose cost and tracing metadata without content'
);

select hasnt_column(
  'public',
  'ai_call_logs',
  'prompt',
  'provider logs have no full prompt column'
);

select hasnt_column(
  'public',
  'ai_call_logs',
  'answer',
  'provider logs have no answer body column'
);

set local role anon;

select throws_ok(
  $$
    select *
    from public.retrieve_available_content_units(
      array_prepend(1::real, array_fill(0::real, array[1023]))
        ::extensions.vector(1024),
      20
    )
  $$,
  '42501',
  'permission denied for function retrieve_available_content_units',
  'anonymous users cannot call answer retrieval directly'
);

select * from finish();

rollback;
