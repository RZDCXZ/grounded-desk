import { rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type {
  RetrievalEvaluationSummary,
} from "../retrieval/baseline.ts";
import type {
  DecisionEvaluationSummary,
} from "./evaluate.ts";
import {
  createDecisionEvaluatorFingerprint,
  DECISION_EVALUATOR_VERSION,
} from "./evaluator-fingerprint.ts";
import {
  LEGACY_RESPONSE_DECISION_SOURCE,
} from "./legacy-baseline.ts";

export const DECISION_LIVE_REPORT_SCHEMA_VERSION =
  "decision-live-release-report-v2" as const;
export const decisionLiveReportUrl = new URL(
  "./live-release-report.json",
  import.meta.url,
);

export async function createDecisionLiveReleaseReport(
  decision: DecisionEvaluationSummary,
  retrievalBaseline: RetrievalEvaluationSummary,
) {
  if (decision.strategy.evaluationMode !== "live") {
    throw new Error("发布报告只能由全量实时决策评测生成");
  }
  const gate = {
    passed: decision.gate.passed && retrievalBaseline.passed,
    failedRequirements: [
      ...decision.gate.failedRequirements,
      ...(retrievalBaseline.passed ? [] : ["retrieval_baseline"]),
    ],
  };
  if (!gate.passed) {
    throw new Error(
      `发布门槛未通过，拒绝覆盖报告：${gate.failedRequirements.join(", ")}`,
    );
  }
  return {
    schemaVersion: DECISION_LIVE_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    evaluatorVersion: DECISION_EVALUATOR_VERSION,
    evaluatorFingerprint:
      await createDecisionEvaluatorFingerprint(),
    strategyVersion: decision.strategy.version,
    datasetVersion: decision.dataset.version,
    contractFingerprint: decision.strategy.contractFingerprint,
    providers: {
      requestAnalysis: "deepseek/deepseek-v4-flash",
      embedding: "siliconflow/BAAI/bge-m3",
      rerank: "siliconflow/BAAI/bge-reranker-v2-m3",
      evidenceCoverage: "deepseek/deepseek-v4-flash",
      answer: "deepseek/deepseek-v4-flash",
    },
    legacyBaseline: LEGACY_RESPONSE_DECISION_SOURCE,
    decision,
    retrievalBaseline,
    gate,
  };
}

export async function writeDecisionLiveReleaseReport(
  report: Awaited<
    ReturnType<typeof createDecisionLiveReleaseReport>
  >,
) {
  const reportPath = fileURLToPath(decisionLiveReportUrl);
  const temporaryPath =
    `${reportPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(report, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  await rename(temporaryPath, reportPath);
  return reportPath;
}
