import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

export const DECISION_EVALUATOR_VERSION = "decision-evaluator-v2" as const;

export const decisionEvaluatorFiles = [
  "evaluations/decision/dataset.ts",
  "evaluations/decision/dependencies.ts",
  "evaluations/decision/evaluate.ts",
  "evaluations/decision/evaluator-fingerprint.ts",
  "evaluations/decision/legacy-baseline.ts",
  "evaluations/decision/report.ts",
  "evaluations/retrieval/baseline.ts",
  "scripts/evaluate-decision-strategy.ts",
] as const;

export async function createDecisionEvaluatorFingerprint() {
  const hash = createHash("sha256");
  for (const relativePath of decisionEvaluatorFiles) {
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
        .replace(/[0-9a-f]{64}/gu, "<fingerprint>"),
    );
    hash.update("\0");
  }
  return hash.digest("hex");
}
