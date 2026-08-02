import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

test("云端发布按预检、迁移试跑、迁移、生产配置和必要初始化顺序执行", async () => {
  const child = spawn(process.execPath, ["scripts/deploy-cloud.ts"], {
    cwd: projectDirectory,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      CLOUD_RELEASE_DRY_RUN: "true",
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
  });
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
  const orderedSteps = [
    "1. 云端发布预检",
    "2. Supabase 项目连接",
    "3. 迁移 dry-run",
    "4. 推送版本化迁移",
    "5. 推送临时渲染的生产配置",
    "6. 执行必要初始化",
  ];
  let previousIndex = -1;
  for (const step of orderedSteps) {
    const index = stdout.indexOf(step);
    assert.ok(index > previousIndex, `${step} 顺序不正确`);
    previousIndex = index;
  }
  assert.match(stdout, /supabase db push --dry-run/);
  assert.match(stdout, /supabase db push$/m);
  assert.match(stdout, /supabase config push/);
  assert.match(stdout, /scripts\/bootstrap-cloud\.ts/);
  assert.doesNotMatch(stdout + stderr, /--include-seed|supabase\/seed\.sql/);
  assert.doesNotMatch(
    stdout + stderr,
    /test-deepseek-server-key|test-siliconflow-server-key|test-server/,
  );
});
