import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublicSupabaseCallLogger,
} from "../../src/lib/assistant/supabase-grounded-answer.ts";

test("公开回答调用日志关联会话、助手消息和事实诉求", async () => {
  const calls: Array<{
    procedure: string;
    parameters: Record<string, unknown>;
  }> = [];
  const supabase = {
    async rpc(procedure: string, parameters: Record<string, unknown>) {
      calls.push({ procedure, parameters });
      return { error: null };
    },
  };
  const logger = createPublicSupabaseCallLogger(
    supabase as never,
    "00000000-0000-4000-8000-000000000210",
    {
      conversationId: "00000000-0000-4000-8000-000000000401",
      assistantMessageId: "00000000-0000-4000-8000-000000000502",
    },
  );

  await logger.record({
    organizationId: "00000000-0000-4000-8000-000000000101",
    factualRequestId: "00000000-0000-4000-8000-000000000701",
    callType: "evidence_coverage",
    provider: "test",
    model: "coverage-v1",
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
    durationMs: 25,
    outcome: "success",
    errorType: null,
    traceId: "coverage-trace",
  });

  assert.deepEqual(calls, [
    {
      procedure: "record_public_assistant_ai_call",
      parameters: {
        assistant_public_id:
          "00000000-0000-4000-8000-000000000210",
        logged_call_type: "evidence_coverage",
        logged_provider: "test",
        logged_model: "coverage-v1",
        logged_input_tokens: 10,
        logged_output_tokens: 4,
        logged_total_tokens: 14,
        logged_duration_ms: 25,
        logged_outcome: "success",
        logged_error_type: null,
        logged_trace_id: "coverage-trace",
        target_conversation_id:
          "00000000-0000-4000-8000-000000000401",
        target_assistant_message_id:
          "00000000-0000-4000-8000-000000000502",
        target_factual_request_id:
          "00000000-0000-4000-8000-000000000701",
      },
    },
  ]);
});
