import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
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
    sourceRevision: readSourceRevision(),
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

function readSourceRevision() {
  const configuredRevision = process.env.RELEASE_SOURCE_REVISION;
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
