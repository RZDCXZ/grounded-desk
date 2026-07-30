begin;

select plan(3);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
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
      trace_id
    ) values (
      '00000000-0000-4000-8000-000000000101',
      'request_analysis',
      'test',
      'request-analysis-v1',
      10,
      5,
      15,
      20,
      'success',
      'admin-analysis-trace'
    )
  $$,
  'administrator previews can log request analysis calls'
);

select public.publish_assistant();

create temporary table published_assistant as
select public_id
from public.assistants;

reset role;
grant select on published_assistant to service_role;
grant select on public.ai_call_logs to service_role;
set local role service_role;

select lives_ok(
  $$
    select public.record_public_assistant_ai_call(
      (select public_id from published_assistant),
      'request_analysis',
      'test',
      'request-analysis-v1',
      8,
      4,
      12,
      18,
      'error',
      'timeout',
      'public-analysis-trace'
    )
  $$,
  'public assistants can log request analysis failures'
);

select results_eq(
  $$
    select call_type, outcome, error_type, trace_id
    from public.ai_call_logs
    where trace_id in (
      'admin-analysis-trace',
      'public-analysis-trace'
    )
    order by trace_id
  $$,
  $$
    values
      (
        'request_analysis',
        'success',
        null::text,
        'admin-analysis-trace'
      ),
      (
        'request_analysis',
        'error',
        'timeout',
        'public-analysis-trace'
      )
  $$,
  'request analysis logs retain only bounded provider metadata'
);

select * from finish();
rollback;
