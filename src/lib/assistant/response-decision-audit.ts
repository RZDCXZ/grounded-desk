import type { EvidenceCoverageDecision } from "./evidence-coverage.ts";

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

export type AssistantDecisionAudit =
  | ResponseDecisionAudit
  | ClarificationDecisionAudit;

export const responseDecisionAuditSymbol: unique symbol =
  Symbol.for("grounded-desk.response-decision-audit");
