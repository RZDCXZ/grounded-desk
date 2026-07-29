import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { RetrievalEvaluationSummary } from "../../evaluations/retrieval/baseline.ts";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

test("独立命令运行完整双语检索基线并输出可比较摘要", async () => {
  const result = await runEvaluation();

  assert.equal(result.exitCode, 0, result.stderr);
  assert.deepEqual(result.summary.config, {
    candidateLimit: 20,
    evidenceLimit: 5,
    evidenceThreshold: 0.5,
  });
  assert.deepEqual(result.summary.dataset, {
    total: 20,
    answerable: 10,
    refusal: 10,
    languages: {
      zh: 16,
      en: 4,
    },
  });
  assert.deepEqual(result.summary.failures, {
    falseRefusals: 0,
    falseAnswers: 0,
    unsupportedFacts: 0,
    missingCitations: 0,
    unexpectedCitations: 0,
    languageMismatches: 0,
    technicalErrors: 0,
  });
  assert.deepEqual(result.summary.byLanguage, {
    zh: {
      total: 16,
      correct: 16,
      contractViolations: 0,
    },
    en: {
      total: 4,
      correct: 4,
      contractViolations: 0,
    },
  });
  assert.equal(result.summary.passed, true);
});

test("阈值高于基线时整组摘要暴露引用和依据缺口", async () => {
  const result = await runEvaluation({
    RERANK_EVIDENCE_THRESHOLD: "0.51",
  });

  assert.equal(result.exitCode, 1);
  assert.ok(result.summary.failures.missingCitations > 0);
  assert.ok(result.summary.failures.unsupportedFacts > 0);
  assert.equal(result.summary.passed, false);
});

test("阈值过低时整组摘要暴露错误回答和来源外事实", async () => {
  const result = await runEvaluation({
    RERANK_EVIDENCE_THRESHOLD: "0.49",
  });

  assert.equal(result.exitCode, 1);
  assert.ok(result.summary.failures.falseAnswers > 0);
  assert.ok(result.summary.failures.unsupportedFacts > 0);
  assert.ok(result.summary.failures.unexpectedCitations > 0);
  assert.equal(result.summary.passed, false);
});

test("召回数量不足时整组摘要暴露错误拒答", async () => {
  const result = await runEvaluation({
    RETRIEVAL_CANDIDATE_LIMIT: "19",
  });

  assert.equal(result.exitCode, 1);
  assert.ok(result.summary.failures.falseRefusals > 0);
  assert.equal(result.summary.passed, false);
});

test("重排保留数不足时整组摘要暴露预期引用缺失", async () => {
  const result = await runEvaluation({
    RERANK_EVIDENCE_LIMIT: "4",
  });

  assert.equal(result.exitCode, 1);
  assert.ok(result.summary.failures.missingCitations > 0);
  assert.ok(result.summary.failures.unsupportedFacts > 0);
  assert.equal(result.summary.passed, false);
});

async function runEvaluation(
  environmentOverrides: Partial<
    Record<
      | "RETRIEVAL_CANDIDATE_LIMIT"
      | "RERANK_EVIDENCE_LIMIT"
      | "RERANK_EVIDENCE_THRESHOLD",
      string
    >
  > = {},
) {
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "scripts/evaluate-retrieval.ts",
      "--json",
    ],
    {
      cwd: projectDirectory,
      env: {
        ...process.env,
        RETRIEVAL_CANDIDATE_LIMIT: "20",
        RERANK_EVIDENCE_LIMIT: "5",
        RERANK_EVIDENCE_THRESHOLD: "0.5",
        ...environmentOverrides,
      },
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
    summary: JSON.parse(stdout) as RetrievalEvaluationSummary,
  };
}
