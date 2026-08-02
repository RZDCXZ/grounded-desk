import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const releaseChecks = [
  "local-gate",
  "live-ai-smoke",
  "supabase-cloud-deploy",
  "vercel-production-deploy",
  "cloud-smoke",
] as const;

export type ReleaseCheck = (typeof releaseChecks)[number];
export type ReleaseStatus = "passed" | "failed" | "skipped";

export type ReleaseEvidence = {
  schemaVersion: 1;
  check: ReleaseCheck;
  status: ReleaseStatus;
  sourceRevision: string;
  completedAt: string;
  summary: Record<string, string | number | boolean>;
};

export async function writeReleaseEvidence(
  check: ReleaseCheck,
  status: ReleaseStatus,
  summary: ReleaseEvidence["summary"],
) {
  const evidenceDirectory = process.env.RELEASE_EVIDENCE_DIR;
  if (!evidenceDirectory) {
    return;
  }
  const evidence: ReleaseEvidence = {
    schemaVersion: 1,
    check,
    status,
    sourceRevision: readReleaseSourceRevision(),
    completedAt: new Date().toISOString(),
    summary,
  };
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    resolve(evidenceDirectory, `${check}.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export function readReleaseSourceRevision(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const configuredRevision = environment.RELEASE_SOURCE_REVISION;
  if (configuredRevision) {
    if (!/^[0-9a-f]{40}$/u.test(configuredRevision)) {
      throw new Error("RELEASE_SOURCE_REVISION 必须是 40 位 Git SHA");
    }
    return configuredRevision;
  }

  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  const revision = result.stdout.trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/u.test(revision)) {
    throw new Error("无法确定发布证据对应的 Git revision");
  }
  return revision;
}

export async function readReleaseEvidence(
  directory: string,
  expectedCheck: ReleaseCheck,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await readFile(resolve(directory, `${expectedCheck}.json`), "utf8"),
    );
  } catch (error) {
    throw new Error(`无法读取 ${expectedCheck} 发布证据`, { cause: error });
  }
  if (!isReleaseEvidence(parsed) || parsed.check !== expectedCheck) {
    throw new Error(`${expectedCheck} 发布证据格式无效`);
  }
  return parsed;
}

export function isReleaseEvidence(value: unknown): value is ReleaseEvidence {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ReleaseEvidence>;
  return candidate.schemaVersion === 1 &&
    releaseChecks.some((check) => check === candidate.check) &&
    ["passed", "failed", "skipped"].includes(candidate.status ?? "") &&
    typeof candidate.sourceRevision === "string" &&
    /^[0-9a-f]{40}$/u.test(candidate.sourceRevision) &&
    typeof candidate.completedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.completedAt)) &&
    typeof candidate.summary === "object" &&
    candidate.summary !== null &&
    Object.values(candidate.summary).every((item) =>
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    );
}
