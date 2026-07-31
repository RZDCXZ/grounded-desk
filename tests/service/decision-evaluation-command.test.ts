import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  requestsMatchForEvaluation,
} from "../../evaluations/decision/evaluate.ts";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

test("独立命令运行版本化决策评测并证明结构化策略达到发布门槛", async () => {
  const result = await runDecisionEvaluation();

  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.summary.dataset.version, "decision-contract-v1");
  assert.equal(
    result.summary.strategy.version,
    "structured-evidence-v1.a13dc1d89b2b",
  );
  assert.equal(
    result.summary.strategy.contractFingerprint.slice(0, 12),
    "a13dc1d89b2b",
  );
  assert.equal(result.summary.strategy.evaluationMode, "contract");
  assert.ok(result.summary.dataset.total >= 24);
  assert.deepEqual(result.summary.safety, {
    unsupportedFacts: 0,
    unverifiableEvidence: 0,
    wrongCitations: 0,
    technicalFailuresAsRefusals: 0,
  });
  assert.equal(result.summary.failures.wrongAnswers, 0);
  assert.equal(result.summary.failures.wrongRefusals, 0);
  assert.equal(result.summary.failures.requestSplitErrors, 0);
  assert.equal(result.summary.failures.missedRequestSplits, 0);
  assert.equal(result.summary.failures.wrongRequestSplits, 0);
  assert.equal(result.summary.failures.unnecessaryRequestSplits, 0);
  assert.equal(result.summary.failures.partialAnswerErrors, 0);
  assert.equal(result.summary.failures.missedConflicts, 0);
  assert.equal(result.summary.failures.falseConflicts, 0);
  assert.equal(result.summary.failures.unnecessaryClarifications, 0);
  assert.equal(result.summary.failures.wrongHandoffs, 0);
  assert.equal(result.summary.comparison.newWrongAnswers, 0);
  assert.ok(
    result.summary.comparison.newWrongAnswers <=
      result.summary.comparison.legacyWrongAnswers,
  );
  assert.ok(
    result.summary.comparison.newWrongRefusals <
      result.summary.comparison.legacyWrongRefusals,
  );
  assert.ok(result.summary.comparison.wrongRefusalReduction >= 0.5);
  assert.ok(result.summary.calls.requestAnalysis.count > 0);
  assert.ok(result.summary.calls.evidenceCoverage.count > 0);
  assert.ok(result.summary.calls.totalDurationMs >= 0);
  assert.ok(
    result.summary.cases.every(({ attempts }) => attempts === 1),
  );
  assert.equal(result.summary.gate.passed, true);
  assert.deepEqual(result.summary.gate.failedRequirements, []);
});

test("决策评测集逐题标注诉求、完整性、覆盖、结果、引用、待解决问题和语言", async () => {
  const result = await runDecisionEvaluation();

  assert.equal(result.exitCode, 0, result.stderr);
  assert.ok(
    result.summary.cases.every((item) =>
      item.annotation.language &&
      Array.isArray(item.annotation.factualRequests) &&
      item.annotation.factualRequests.every((request) =>
        request.originalText &&
        request.normalizedQuestion &&
        request.completeness &&
        request.coverage
      ) &&
      item.annotation.resultType &&
      item.annotation.legacyBaseline.strategyVersion ===
        "fixed-routing-threshold-v1" &&
      item.annotation.legacyBaseline.sourceCommit === "9d5010b" &&
      item.annotation.legacyBaseline.captureMethod ===
        "executed_historical_preview_modules" &&
      Array.isArray(item.annotation.citationSourceIds) &&
      Number.isInteger(item.annotation.unresolvedQuestionCount)
    ),
  );
  assert.ok(
    [
      "single_supported",
      "single_unsupported",
      "semantic_paraphrase",
      "compound_all_supported",
      "compound_partial",
      "compound_all_unsupported",
      "over_three_requests",
      "knowledge_conflict",
      "apparent_conflict",
      "clarification",
      "human_handoff",
      "conversational",
      "mixed",
      "out_of_scope",
      "prompt_injection",
      "malicious_knowledge",
      "forged_citation",
      "provider_failure",
    ].every((coverage) =>
      result.summary.dataset.coverage.includes(coverage)
    ),
  );
  assert.ok(
    result.summary.confusionMatrices.byLanguage.zh.total > 0,
  );
  assert.ok(
    result.summary.confusionMatrices.byLanguage.en.total > 0,
  );
  assert.ok(
    result.summary.confusionMatrices.byRequestShape.single.total > 0,
  );
  assert.ok(
    result.summary.confusionMatrices.byRequestShape.compound.total > 0,
  );
});

test("子集诊断不能被误认为可发布的全量门禁", async () => {
  const result = await runDecisionEvaluation(["--case=zh-single-supported"]);

  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.dataset.total, 1);
  assert.equal(result.summary.gate.passed, false);
  assert.ok(
    result.summary.gate.failedRequirements.includes(
      "complete_decision_dataset",
    ),
  );
});

test("复合诉求评测拒绝重复吞入整条消息的 originalText", () => {
  const expected = [
    {
      originalText: "你们提供什么服务",
      normalizedQuestion: "北辰工作室提供什么服务？",
      completeness: "complete" as const,
      coverage: "supported" as const,
      outcome: "supported" as const,
      allowedContentUnitIds: [],
    },
    {
      originalText: "在上海有办公室吗",
      normalizedQuestion: "北辰工作室是否在上海设有办公室？",
      completeness: "complete" as const,
      coverage: "unsupported" as const,
      outcome: "unsupported" as const,
      allowedContentUnitIds: [],
    },
  ];
  const duplicatedWholeQuestion = expected.map((request) => ({
    ...request,
    originalText: "你们提供什么服务，在上海有办公室吗？",
    outcome: request.coverage,
    citationSourceIds: [],
    evidenceContentUnitIds: [],
  }));

  assert.equal(
    requestsMatchForEvaluation(
      expected,
      duplicatedWholeQuestion,
      "live",
    ),
    false,
  );
});

async function runDecisionEvaluation(extraArguments: string[] = []) {
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "scripts/evaluate-decision-strategy.ts",
      "--json",
      ...extraArguments,
    ],
    {
      cwd: projectDirectory,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });

  return {
    exitCode,
    stderr,
    summary: JSON.parse(stdout) as DecisionEvaluationSummary,
  };
}

type DecisionEvaluationSummary = {
  dataset: {
    version: string;
    total: number;
    coverage: string[];
  };
  strategy: {
    version: string;
    contractFingerprint: string;
    evaluatorFingerprint: string;
    evaluationMode: string;
  };
  failures: {
    wrongAnswers: number;
    wrongRefusals: number;
    requestSplitErrors: number;
    missedRequestSplits: number;
    wrongRequestSplits: number;
    unnecessaryRequestSplits: number;
    partialAnswerErrors: number;
    missedConflicts: number;
    falseConflicts: number;
    unnecessaryClarifications: number;
    wrongHandoffs: number;
  };
  safety: {
    unsupportedFacts: number;
    unverifiableEvidence: number;
    wrongCitations: number;
    technicalFailuresAsRefusals: number;
  };
  comparison: {
    legacyWrongAnswers: number;
    legacyWrongRefusals: number;
    newWrongAnswers: number;
    newWrongRefusals: number;
    wrongRefusalReduction: number;
  };
  calls: {
    requestAnalysis: { count: number; durationMs: number };
    evidenceCoverage: { count: number; durationMs: number };
    totalDurationMs: number;
  };
  gate: {
    passed: boolean;
    failedRequirements: string[];
  };
  confusionMatrices: {
    byLanguage: {
      zh: { total: number };
      en: { total: number };
    };
    byRequestShape: {
      single: { total: number };
      compound: { total: number };
    };
  };
  cases: Array<{
    attempts: number;
    annotation: {
      language: string;
      factualRequests: Array<{
        originalText: string;
        normalizedQuestion: string;
        completeness: string;
        coverage: string;
      }>;
      resultType: string;
      legacyBaseline: {
        strategyVersion: string;
        resultType: string;
        sourceCommit: string;
        captureMethod: string;
      };
      citationSourceIds: string[];
      unresolvedQuestionCount: number;
    };
  }>;
};
