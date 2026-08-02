import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(
  new URL("../..", import.meta.url),
);

export const responseDecisionContractFiles = [
  "evaluations/decision/dataset.ts",
  "src/lib/ai/embeddings.ts",
  "src/lib/ai/evidence-coverage-provider.ts",
  "src/lib/ai/grounded-answer-providers.ts",
  "src/lib/ai/request-analysis-provider.ts",
  "src/lib/assistant/conversation-persistence.ts",
  "src/lib/assistant/conversation-result.ts",
  "src/lib/assistant/conversational-response.ts",
  "src/lib/assistant/evidence-coverage.ts",
  "src/lib/assistant/grounded-answer.ts",
  "src/lib/assistant/multi-request-response.ts",
  "src/lib/assistant/request-analysis.ts",
  "src/lib/assistant/response-decision-release.ts",
  "src/lib/assistant/response-sections.ts",
  "src/lib/assistant/retrieval-config.ts",
  "supabase/migrations/20260730110000_extend_conversation_result_contracts.sql",
  "supabase/migrations/20260730130000_expand_per_request_response_contracts.sql",
  "supabase/migrations/20260730150000_complete_single_section_responses.sql",
  "supabase/migrations/20260730170000_log_request_analysis_calls.sql",
  "supabase/migrations/20260730190000_persist_single_request_evidence_decisions.sql",
  "supabase/migrations/20260730210000_persist_clarification_handoff_decisions.sql",
  "supabase/migrations/20260730230000_persist_knowledge_conflict_decisions.sql",
  "supabase/migrations/20260730250000_persist_multi_request_decisions.sql",
  "supabase/migrations/20260730270000_review_structured_response_decisions.sql",
  "supabase/migrations/20260730290000_gate_and_switch_response_decision_strategy.sql",
  "supabase/migrations/20260801090000_release_unclear_conversation_strategy.sql",
] as const;

export async function createResponseDecisionContractFingerprint() {
  const hash = createHash("sha256");

  for (const relativePath of responseDecisionContractFiles) {
    const content = await readFile(
      `${projectDirectory}/${relativePath}`,
      "utf8",
    );
    hash.update(relativePath);
    hash.update("\0");
    hash.update(
      content
        .replace(/\r\n/gu, "\n")
        .replace(
          /structured-evidence-v1(?:\.[0-9a-f]{12})?/gu,
          "<response-decision-strategy-version>",
        )
        .replace(/[0-9a-f]{64}/gu, "<contract-fingerprint>"),
    );
    hash.update("\0");
  }

  return hash.digest("hex");
}
