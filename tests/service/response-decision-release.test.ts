import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDecisionEvaluation } from "../../evaluations/decision/evaluate.ts";
import { decisionEvaluationCases } from "../../evaluations/decision/dataset.ts";
import {
  createDecisionEvaluatorFingerprint,
} from "../../evaluations/decision/evaluator-fingerprint.ts";
import {
  containsUnsupportedFact,
} from "../../evaluations/decision/evaluate.ts";
import {
  attachResponseDecisionRelease,
  isApprovedResponseDecisionRuntime,
  responseDecisionRelease,
  responseDecisionReleaseSymbol,
} from "../../src/lib/assistant/response-decision-release.ts";
import type {
  SectionedAssistantResponseEvent,
} from "../../src/lib/assistant/response-sections.ts";
import type {
  MultiRequestDecisionAudit,
} from "../../src/lib/assistant/response-decision-audit.ts";

test("发布清单与实际决策评测结果一致", async () => {
  const summary = await runDecisionEvaluation();

  assert.equal(summary.gate.passed, true);
  assert.equal(
    responseDecisionRelease.strategyVersion,
    summary.strategy.version,
  );
  assert.equal(
    responseDecisionRelease.datasetVersion,
    summary.dataset.version,
  );
  assert.equal(
    responseDecisionRelease.contractFingerprint,
    summary.strategy.contractFingerprint,
  );
  assert.ok(
    responseDecisionRelease.strategyVersion.endsWith(
      responseDecisionRelease.contractFingerprint.slice(0, 12),
    ),
  );
  assert.deepEqual(responseDecisionRelease.safety, summary.safety);
  assert.deepEqual(responseDecisionRelease.comparison, {
    legacyWrongAnswers: summary.comparison.legacyWrongAnswers,
    legacyWrongRefusals: summary.comparison.legacyWrongRefusals,
    newWrongAnswers: summary.comparison.newWrongAnswers,
    newWrongRefusals: summary.comparison.newWrongRefusals,
  });
});

test("真实模型发布报告绑定当前契约且完整覆盖固定评测集", async () => {
  const report = JSON.parse(
    await readFile(
      new URL(
        "../../evaluations/decision/live-release-report.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    schemaVersion: string;
    strategyVersion: string;
    datasetVersion: string;
    contractFingerprint: string;
    evaluatorFingerprint: string;
    providers: Record<string, string>;
    legacyBaseline: {
      commit: string;
      captureMethod: string;
      blobs: Record<string, string>;
    };
    decision: {
      strategy: { evaluationMode: string; evaluatorFingerprint: string };
      dataset: { total: number };
      safety: typeof responseDecisionRelease.safety;
      comparison: typeof responseDecisionRelease.comparison & {
        wrongRefusalReduction: number;
      };
      confusionMatrices: unknown;
      cases: Array<{ id: string; attempts: number; passed: boolean }>;
    };
    retrievalBaseline: { passed: boolean; cases: unknown[] };
    gate: {
      passed: boolean;
      failedRequirements: string[];
    };
  };

  assert.equal(report.schemaVersion, "decision-live-release-report-v2");
  assert.equal(report.decision.strategy.evaluationMode, "live");
  assert.equal(
    report.strategyVersion,
    responseDecisionRelease.strategyVersion,
  );
  assert.equal(
    report.datasetVersion,
    responseDecisionRelease.datasetVersion,
  );
  assert.equal(
    report.contractFingerprint,
    responseDecisionRelease.contractFingerprint,
  );
  assert.equal(
    report.evaluatorFingerprint,
    await createDecisionEvaluatorFingerprint(),
  );
  assert.equal(
    report.evaluatorFingerprint,
    responseDecisionRelease.evaluatorFingerprint,
  );
  assert.equal(
    report.decision.strategy.evaluatorFingerprint,
    report.evaluatorFingerprint,
  );
  assert.deepEqual(
    report.decision.safety,
    responseDecisionRelease.safety,
  );
  assert.deepEqual(
    {
      legacyWrongAnswers:
        report.decision.comparison.legacyWrongAnswers,
      legacyWrongRefusals:
        report.decision.comparison.legacyWrongRefusals,
      newWrongAnswers: report.decision.comparison.newWrongAnswers,
      newWrongRefusals: report.decision.comparison.newWrongRefusals,
    },
    responseDecisionRelease.comparison,
  );
  assert.ok(report.decision.comparison.wrongRefusalReduction >= 0.5);
  assert.equal(report.decision.dataset.total, decisionEvaluationCases.length);
  assert.deepEqual(
    report.decision.cases.map(({ id }) => id),
    decisionEvaluationCases.map(({ id }) => id),
  );
  assert.ok(
    report.decision.cases.every(
      ({ attempts, passed }) => attempts === 1 && passed,
    ),
  );
  assert.ok(report.decision.confusionMatrices);
  assert.equal(report.retrievalBaseline.passed, true);
  assert.ok(report.retrievalBaseline.cases.length > 0);
  assert.equal(report.legacyBaseline.commit, "9d5010b");
  assert.equal(
    report.legacyBaseline.captureMethod,
    "executed_historical_preview_modules",
  );
  assert.ok(
    Object.values(report.legacyBaseline.blobs).every(
      (hash) => /^[0-9a-f]{40}$/u.test(hash),
    ),
  );
  assert.deepEqual(report.gate, {
    passed: true,
    failedRequirements: [],
  });
  assert.deepEqual(report.providers, {
    requestAnalysis: "deepseek/deepseek-v4-flash",
    embedding: "siliconflow/BAAI/bge-m3",
    rerank: "siliconflow/BAAI/bge-reranker-v2-m3",
    evidenceCoverage: "deepseek/deepseek-v4-flash",
    answer: "deepseek/deepseek-v4-flash",
  });
});

test("正式发布流在完成事件上附加同一策略版本且不改变公开协议", async () => {
  const sourceEvent = {
    type: "message_complete",
    resultType: "conversational_response",
    sections: [{
      id: "section-1",
      order: 1,
      status: "conversational",
      content: "Hello",
      citations: [],
    }],
  } satisfies SectionedAssistantResponseEvent;
  const events = await Array.fromAsync(
    attachResponseDecisionRelease([sourceEvent]),
  );
  const completion = events.at(-1)!;

  assert.equal(completion.type, "message_complete");
  assert.equal(
    Reflect.get(completion, responseDecisionReleaseSymbol),
    "structured-evidence-v1.a13dc1d89b2b",
  );
  assert.deepEqual(Object.keys(completion).sort(), [
    "resultType",
    "sections",
    "type",
  ]);
});

test("发布策略拒绝未评测的模型或候选配置", () => {
  const approved = responseDecisionRelease.contract;

  assert.equal(
    isApprovedResponseDecisionRuntime({
      models: approved.models,
      retrieval: approved.retrieval,
    }),
    true,
  );
  assert.equal(
    isApprovedResponseDecisionRuntime({
      models: {
        ...approved.models,
        requestAnalysis: "unapproved-model",
      },
      retrieval: approved.retrieval,
    }),
    false,
  );
  assert.equal(
    isApprovedResponseDecisionRuntime({
      models: approved.models,
      retrieval: {
        ...approved.retrieval,
        candidateLimit: approved.retrieval.candidateLimit + 1,
      },
    }),
    false,
  );
});

test("复合回答逐诉求绑定正文与自身证据，不能用另一诉求的证据兜底", () => {
  const audit = {
    version: "multi-request-decision-v1",
    requestAnalysisVersion: "request-analysis-v1",
    responseStrategyVersion: "multi-request-response-v1",
    resultType: "grounded_answer",
    requests: [
      requestAudit("request-1", "问题一", "证据一"),
      requestAudit("request-2", "问题二", "证据二"),
    ],
  } satisfies MultiRequestDecisionAudit;

  assert.equal(
    containsUnsupportedFact(
      [
        supportedSection("request-1", 1, "证据二"),
        supportedSection("request-2", 2, "证据一"),
      ],
      audit,
    ),
    true,
  );
  assert.equal(
    containsUnsupportedFact(
      [
        supportedSection("request-1", 1, "证据一"),
        supportedSection("request-2", 2, "证据二"),
      ],
      audit,
    ),
    false,
  );
});

test("回答不能通过删除证据中的否定词制造相反事实", () => {
  const audit = {
    version: "multi-request-decision-v1",
    requestAnalysisVersion: "request-analysis-v1",
    responseStrategyVersion: "multi-request-response-v1",
    resultType: "grounded_answer",
    requests: [
      requestAudit("request-1", "是否保证当天退款", "本服务不保证当天退款。"),
    ],
  } satisfies MultiRequestDecisionAudit;

  assert.equal(
    containsUnsupportedFact(
      [supportedSection("request-1", 1, "本服务保证当天退款。")],
      audit,
    ),
    true,
  );
});

function requestAudit(id: string, question: string, excerpt: string) {
  return {
    factualRequest: {
      id,
      order: Number(id.at(-1)),
      originalText: question,
      normalizedQuestion: question,
      completeness: "complete" as const,
      missingInformation: [],
      clarificationRound: 0 as const,
    },
    outcome: "supported" as const,
    coverage: {
      version: "evidence-coverage-v1" as const,
      factualRequestId: id,
      status: "supported" as const,
      evidence: [{
        contentUnitId: `${id}-unit`,
        knowledgeSourceId: `${id}-source`,
        sourceTitle: question,
        sourceUrl: null,
        relationship: "supports" as const,
        exactExcerpt: excerpt,
        reason: "测试逐诉求证据绑定。",
      }],
    },
  };
}

function supportedSection(id: string, order: number, content: string) {
  return {
    id,
    order,
    status: "supported" as const,
    content,
    citations: [],
  };
}
