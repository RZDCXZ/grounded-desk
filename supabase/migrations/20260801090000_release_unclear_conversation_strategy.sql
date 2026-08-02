create or replace function private.assign_message_response_decision_strategy_version()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.response_decision_strategy_version := null;
    return new;
  end if;

  if
    old.status = 'pending'
    and old.message_type = 'grounded_answer'
    and new.status in ('completed', 'failed')
    and new.message_type in (
      'grounded_answer',
      'partially_grounded_answer',
      'knowledge_conflict',
      'conversational_response',
      'clarification_request',
      'human_handoff',
      'grounded_refusal',
      'technical_failure'
    )
  then
    new.response_decision_strategy_version :=
      'structured-evidence-v1.ca387839e51a';
  else
    new.response_decision_strategy_version :=
      old.response_decision_strategy_version;
  end if;

  return new;
end;
$$;
