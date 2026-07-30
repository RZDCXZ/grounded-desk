import assert from "node:assert/strict";
import test from "node:test";

import { selectCompletionProcedure } from "../../src/lib/assistant/conversation-persistence.ts";
import type {
  MultiRequestDecisionAudit,
  ResponseDecisionAudit,
} from "../../src/lib/assistant/response-decision-audit.ts";

const conflictAudit: ResponseDecisionAudit = {
  factualRequest: {
    id: "00000000-0000-4000-8000-000000001805",
    originalText: "退款多久到账？",
    normalizedQuestion: "退款多久到账？",
    requestAnalysisVersion: "request-analysis-v1",
  },
  coverage: {
    version: "evidence-coverage-v1",
    factualRequestId: "00000000-0000-4000-8000-000000001805",
    status: "conflicting",
    evidence: [],
  },
};

test("知识冲突审计只路由到冲突事务而不落入普通单项完成过程", () => {
  assert.equal(
    selectCompletionProcedure("knowledge_conflict", conflictAudit),
    "complete_public_conflict_decision",
  );
});

test("多诉求审计只路由到逐项原子完成事务", () => {
  const audit: MultiRequestDecisionAudit = {
    version: "multi-request-decision-v1",
    requestAnalysisVersion: "request-analysis-v1",
    responseStrategyVersion: "multi-request-response-v1",
    resultType: "partially_grounded_answer",
    requests: [],
  };

  assert.equal(
    selectCompletionProcedure("partially_grounded_answer", audit),
    "complete_public_multi_request_decision",
  );
});
