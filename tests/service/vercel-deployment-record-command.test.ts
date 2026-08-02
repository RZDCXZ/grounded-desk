import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));
const sourceRevision = "1234567890abcdef1234567890abcdef12345678";
const deploymentId = "dpl_1234567890abcdef";
const projectId = "prj_1234567890abcdef";

test("Vercel 证据会向官方 API 核对部署、项目、Production 状态和源码版本", async () => {
  const evidenceDirectory = await mkdtemp(
    join(tmpdir(), "groundeddesk-vercel-evidence-"),
  );
  let origin = "";
  const requests: Array<{ url: string; authorization?: string }> = [];
  const server = createServer((request, response) => {
    requests.push({
      url: request.url ?? "",
      authorization: request.headers.authorization,
    });
    if (request.url?.startsWith(`/v13/deployments/${deploymentId}`)) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: deploymentId,
        projectId,
        readyState: "READY",
        target: "production",
        url: new URL(origin).host,
        alias: [new URL(origin).host],
        meta: { githubCommitSha: sourceRevision },
      }));
      return;
    }
    response.statusCode = 200;
    response.end("GroundedDesk");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;

  try {
    const result = await runRecorder(evidenceDirectory, origin, origin);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /Vercel Production 验证通过/);
    assert.deepEqual(requests, [
      {
        url: `/v13/deployments/${deploymentId}?teamId=team_groundeddesk`,
        authorization: "Bearer vercel-test-access-token",
      },
      { url: "/", authorization: undefined },
    ]);
    const evidence = JSON.parse(
      await readFile(
        join(evidenceDirectory, "vercel-production-deploy.json"),
        "utf8",
      ),
    ) as { status: string; sourceRevision: string; summary: object };
    assert.equal(evidence.status, "passed");
    assert.equal(evidence.sourceRevision, sourceRevision);
    assert.deepEqual(evidence.summary, {
      deploymentUrl: origin,
      deploymentId,
      projectId,
      environment: "production",
    });
  } finally {
    server.close();
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
});

test("Vercel 证据拒绝 API 返回的不同源码版本", async () => {
  const evidenceDirectory = await mkdtemp(
    join(tmpdir(), "groundeddesk-vercel-evidence-"),
  );
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id: deploymentId,
      projectId,
      readyState: "READY",
      target: "production",
      url: "127.0.0.1",
      meta: {
        githubCommitSha: "abcdef1234567890abcdef1234567890abcdef12",
      },
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const result = await runRecorder(evidenceDirectory, origin, origin);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /源码版本与 RELEASE_SOURCE_REVISION 不一致/);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /vercel-test-access-token/,
    );
  } finally {
    server.close();
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
});

function runRecorder(
  evidenceDirectory: string,
  apiBaseUrl: string,
  deploymentUrl: string,
) {
  const child = spawn(
    process.execPath,
    ["scripts/record-vercel-deployment.ts"],
    {
      cwd: projectDirectory,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        VERCEL_API_BASE_URL: apiBaseUrl,
        VERCEL_ACCESS_TOKEN: "vercel-test-access-token",
        VERCEL_TEAM_ID: "team_groundeddesk",
        VERCEL_DEPLOYMENT_URL: deploymentUrl,
        VERCEL_DEPLOYMENT_ID: deploymentId,
        VERCEL_PROJECT_ID: projectId,
        RELEASE_EVIDENCE_DIR: evidenceDirectory,
        RELEASE_SOURCE_REVISION: sourceRevision,
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
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        resolve({ exitCode: code ?? -1, stdout, stderr });
      });
    },
  );
}
