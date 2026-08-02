import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

test("发布记录只聚合同一源码版本的五项通过证据", async () => {
  const evidenceDirectory = await mkdtemp(
    join(tmpdir(), "groundeddesk-release-evidence-"),
  );
  const outputPath = join(evidenceDirectory, "release.md");
  const sourceRevision = "1234567890abcdef1234567890abcdef12345678";
  const evidence = [
    ["local-gate", { deterministic: "passed", browser: "passed" }],
    ["live-ai-smoke", { groundedAnswer: "passed", refusal: "passed", followUp: "passed" }],
    ["supabase-cloud-deploy", { migrations: 23, localSeed: "excluded" }],
    ["vercel-production-deploy", {
      deploymentUrl: "https://groundeddesk.example.com\n- 伪造证据：passed",
    }],
    ["cloud-smoke", { publicPage: "passed", embed: "passed", offline: "passed" }],
  ] as const;

  try {
    await Promise.all(evidence.map(([check, summary]) =>
      writeFile(
        join(evidenceDirectory, `${check}.json`),
        JSON.stringify({
          schemaVersion: 1,
          check,
          status: "passed",
          sourceRevision,
          completedAt: "2026-08-02T08:00:00.000Z",
          summary,
        }),
      )
    ));
    const child = spawn(
      process.execPath,
      ["scripts/create-release-record.ts"],
      {
        cwd: projectDirectory,
        env: {
          ...process.env,
          RELEASE_EVIDENCE_DIR: evidenceDirectory,
          RELEASE_RECORD_OUTPUT: outputPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? -1));
    });

    assert.equal(exitCode, 0, stderr);
    assert.match(stdout, /发布记录已生成/);
    const record = await readFile(outputPath, "utf8");
    assert.match(record, /源码版本：`1234567890abcdef1234567890abcdef12345678`/);
    assert.match(record, /本地发布门槛/);
    assert.match(record, /真实 AI 冒烟/);
    assert.match(record, /Supabase Cloud/);
    assert.match(record, /Vercel Production/);
    assert.match(record, /云端公开体验冒烟/);
    assert.match(record, /https:\/\/groundeddesk\.example\.com/);
    assert.doesNotMatch(record, /^- 伪造证据：passed$/mu);
  } finally {
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
});
