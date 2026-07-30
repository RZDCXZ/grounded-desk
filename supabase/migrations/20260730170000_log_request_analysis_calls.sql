alter table public.ai_call_logs
drop constraint ai_call_logs_call_type_check;

alter table public.ai_call_logs
add constraint ai_call_logs_call_type_check
check (
  call_type in (
    'request_analysis',
    'embedding',
    'rerank',
    'answer'
  )
);
