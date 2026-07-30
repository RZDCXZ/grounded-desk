import type { EvidenceCoverageDecision } from "./evidence-coverage.ts";
import type { ConversationResultType } from "./conversation-result.ts";

export type AuditedFactualRequest = {
  id: string;
  originalText: string;
  normalizedQuestion: string;
  requestAnalysisVersion: string;
};

export type ResponseDecisionAudit = {
  factualRequest: AuditedFactualRequest;
  coverage: EvidenceCoverageDecision;
};

export type ClarificationDecisionAudit = {
  factualRequest: AuditedFactualRequest & {
    missingInformation: string[];
    clarificationRound: 1 | 2;
  };
  outcome: "clarification_request" | "human_handoff";
  responseStrategyVersion: "clarification-handoff-v1";
};

export type ClarificationThreadState = {
  originalText: string;
  round: 1 | 2;
  latestClarification: string;
};

export type MultiRequestDecisionAudit = {
  version: "multi-request-decision-v1";
  requestAnalysisVersion: string;
  responseStrategyVersion: "multi-request-response-v1";
  resultType: ConversationResultType;
  requests: Array<{
    factualRequest: {
      id: string;
      order: number;
      originalText: string;
      normalizedQuestion: string;
      completeness: "complete" | "incomplete";
      missingInformation: string[];
      clarificationRound: 0 | 1 | 2;
    };
    outcome:
      | "supported"
      | "unsupported"
      | "conflicting"
      | "clarification_request"
      | "human_handoff";
    coverage?: EvidenceCoverageDecision;
  }>;
};

export type AssistantDecisionAudit =
  | ResponseDecisionAudit
  | ClarificationDecisionAudit
  | MultiRequestDecisionAudit;

export const responseDecisionAuditSymbol: unique symbol =
  Symbol.for("grounded-desk.response-decision-audit");
