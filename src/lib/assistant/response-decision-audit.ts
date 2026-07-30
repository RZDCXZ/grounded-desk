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

export const responseDecisionAuditSymbol: unique symbol =
  Symbol.for("grounded-desk.response-decision-audit");
