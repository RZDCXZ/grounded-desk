import type { ConversationResultType } from "./conversation-result.ts";
import type {
  AssistantDecisionAudit,
} from "./response-decision-audit.ts";

export function selectCompletionProcedure(
  resultType: ConversationResultType,
  audit: AssistantDecisionAudit | undefined,
) {
  if (!audit) {
    return "complete_public_conversation_sections";
  }

  if ("coverage" in audit) {
    return resultType === "knowledge_conflict"
      ? "complete_public_conflict_decision"
      : "complete_public_single_request_decision";
  }

  return "complete_public_clarification_decision";
}
