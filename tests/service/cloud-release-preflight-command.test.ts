import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

test("云端发布预检只允许生产配置、版本化迁移和必要初始化数据", async () => {
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
  assert.match(stdout, /生产配置：supabase\/config\.production\.toml/);
  assert.match(stdout, /必要初始化：scripts\/bootstrap-cloud\.ts/);
  assert.match(stdout, /本地种子：EXCLUDED \(supabase\/seed\.sql\)/);
  assert.match(stdout, /Vercel 服务端密钥：PASS/);
  assert.doesNotMatch(
    stdout + stderr,
    /test-deepseek-server-key|test-siliconflow-server-key|test-server/,
  );
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
