import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));
const sourceRevision = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: projectDirectory,
  encoding: "utf8",
}).stdout.trim();

test("云端发布预检只允许生产配置、版本化迁移和必要初始化数据", async () => {
  const evidenceDirectory = await createPrerequisiteEvidence();
  try {
    const child = spawn(
      process.execPath,
      ["scripts/check-cloud-release.ts"],
      {
        cwd: projectDirectory,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL:
            "https://abcdefghijklmnopqrst.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-public",
          SUPABASE_SECRET_KEY: "sb_secret_test-server",
          SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
          APP_URL: "https://groundeddesk.example.com",
          EMBED_APP_URL: "https://embed.groundeddesk.example.com",
          ADMIN_EMAIL: "admin@example.com",
          DEEPSEEK_API_KEY: "test-deepseek-server-key",
          SILICONFLOW_API_KEY: "test-siliconflow-server-key",
          DETERMINISTIC_AI: "false",
          DETERMINISTIC_EMBEDDINGS: "false",
          ALLOW_PRIVATE_WEB_SOURCES: "false",
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

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? -1));
    });

    assert.equal(exitCode, 0, stderr);
    assert.match(stdout, /云端发布预检通过/);
    assert.match(stdout, /版本化迁移：\d+ 个/);
    assert.match(stdout, /本地与真实 AI 证据：PASS/);
    assert.match(stdout, /生产配置：supabase\/config\.production\.toml/);
    assert.match(stdout, /必要初始化：scripts\/bootstrap-cloud\.ts/);
    assert.match(stdout, /本地种子：EXCLUDED \(supabase\/seed\.sql\)/);
    assert.match(stdout, /Vercel 服务端密钥：PASS/);
    assert.doesNotMatch(
      stdout + stderr,
      /test-deepseek-server-key|test-siliconflow-server-key|test-server/,
    );
  } finally {
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
});

test("云端发布预检拒绝错连项目、公开服务端密钥和生产测试开关", async () => {
  const child = spawn(
    process.execPath,
    ["scripts/check-cloud-release.ts"],
    {
      cwd: projectDirectory,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://wrongprojectrefxxxx.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-public",
        NEXT_PUBLIC_SUPABASE_SECRET_KEY: "must-not-be-public",
        SUPABASE_SECRET_KEY: "sb_secret_test-server",
        SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
        APP_URL: "https://groundeddesk.example.com",
        EMBED_APP_URL: "https://groundeddesk.example.com",
        ADMIN_EMAIL: "admin@example.com",
        DEEPSEEK_API_KEY: "test-deepseek-server-key",
        SILICONFLOW_API_KEY: "test-siliconflow-server-key",
        DETERMINISTIC_AI: "true",
        ALLOW_PRIVATE_WEB_SOURCES: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });

  assert.equal(exitCode, 1);
  assert.match(
    stderr,
    /SUPABASE_PROJECT_REF 与 NEXT_PUBLIC_SUPABASE_URL 不匹配/,
  );
  assert.match(stderr, /禁止公开服务端密钥变量/);
  assert.match(stderr, /APP_URL 与 EMBED_APP_URL 必须使用不同来源/);
  assert.match(stderr, /DETERMINISTIC_AI 在生产环境必须关闭/);
  assert.match(stderr, /ALLOW_PRIVATE_WEB_SOURCES 在生产环境必须关闭/);
  assert.doesNotMatch(
    stderr,
    /must-not-be-public|test-deepseek-server-key|test-siliconflow-server-key/,
  );
});

test("云端发布预检拒绝缺失、跳过或不同源码版本的前置证据", async () => {
  const evidenceDirectory = await createPrerequisiteEvidence({
    liveStatus: "skipped",
    liveRevision: "abcdef1234567890abcdef1234567890abcdef12",
  });
  try {
    const child = spawn(process.execPath, ["scripts/check-cloud-release.ts"], {
      cwd: projectDirectory,
      env: {
        ...validEnvironment(),
        RELEASE_EVIDENCE_DIR: evidenceDirectory,
        RELEASE_SOURCE_REVISION: sourceRevision,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? -1));
    });

    assert.equal(exitCode, 1);
    assert.match(stderr, /live-ai-smoke.*必须为 passed/);
    assert.match(stderr, /live-ai-smoke.*源码版本/);
  } finally {
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
});

test("生产 Magic Link 模板路径相对于 Supabase workdir 可解析", async () => {
  const configuration = await readFile(
    join(projectDirectory, "supabase/config.production.toml"),
    "utf8",
  );
  assert.match(
    configuration,
    /^content_path = "\.\/supabase\/templates\/magic-link\.html"$/mu,
  );
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL:
      "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-public",
    SUPABASE_SECRET_KEY: "sb_secret_test-server",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    APP_URL: "https://groundeddesk.example.com",
    EMBED_APP_URL: "https://embed.groundeddesk.example.com",
    ADMIN_EMAIL: "admin@example.com",
    DEEPSEEK_API_KEY: "test-deepseek-server-key",
    SILICONFLOW_API_KEY: "test-siliconflow-server-key",
    DETERMINISTIC_AI: "false",
    DETERMINISTIC_EMBEDDINGS: "false",
    ALLOW_PRIVATE_WEB_SOURCES: "false",
  };
}

async function createPrerequisiteEvidence(options?: {
  liveStatus?: "passed" | "skipped";
  liveRevision?: string;
}) {
  const directory = await mkdtemp(
    join(tmpdir(), "groundeddesk-preflight-evidence-"),
  );
  await Promise.all([
    writeEvidence(directory, "local-gate", "passed", sourceRevision),
    writeEvidence(
      directory,
      "live-ai-smoke",
      options?.liveStatus ?? "passed",
      options?.liveRevision ?? sourceRevision,
    ),
  ]);
  return directory;
}

async function writeEvidence(
  directory: string,
  check: "local-gate" | "live-ai-smoke",
  status: "passed" | "skipped",
  revision: string,
) {
  await writeFile(
    join(directory, `${check}.json`),
    JSON.stringify({
      schemaVersion: 1,
      check,
      status,
      sourceRevision: revision,
      completedAt: "2026-08-02T08:00:00.000Z",
      summary: { result: status },
    }),
  );
}
