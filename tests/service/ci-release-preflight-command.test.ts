import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

test("CI 发布预检只导出当前本地 Supabase 配置且不泄露 secret", async () => {
  await withPreflightFixture(async (fixture) => {
    const localSecret = "sb_secret_current-local-instance";
    await fixture.writePnpm(
      [
        "#!/bin/sh",
        "printf '%s\\n' 'API_URL=\"http://127.0.0.1:54321\"'",
        "printf '%s\\n' 'PUBLISHABLE_KEY=\"sb_publishable_current-local-instance\"'",
        `printf '%s\\n' 'SECRET_KEY="${localSecret}"'`,
      ].join("\n"),
    );

    const result = await runPreflight({
      PATH: fixture.path,
      GITHUB_ENV: fixture.githubEnvironmentPath,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /CI 发布预检通过/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(localSecret));
    assert.equal(
      await readFile(fixture.githubEnvironmentPath, "utf8"),
      [
        "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_current-local-instance",
        `SUPABASE_SECRET_KEY=${localSecret}`,
        "",
      ].join("\n"),
    );
  });
});

test("CI 发布预检拒绝真实 AI、Supabase Cloud 和 Vercel 配置", async () => {
  await withPreflightFixture(async (fixture) => {
    const forbiddenValues = [
      "must-not-use-deepseek",
      "must-not-use-siliconflow",
      "must-not-use-supabase-secret",
      "must-not-use-project-ref",
      "must-not-use-supabase-access-token",
      "must-not-use-database-password",
      "must-not-use-vercel-token",
    ];
    await fixture.writePnpm("#!/bin/sh\nexit 99\n");

    const result = await runPreflight({
      PATH: fixture.path,
      GITHUB_ENV: fixture.githubEnvironmentPath,
      RUN_LIVE_AI_SMOKE: "true",
      DEEPSEEK_API_KEY: forbiddenValues[0],
      SILICONFLOW_API_KEY: forbiddenValues[1],
      SUPABASE_SECRET_KEY: forbiddenValues[2],
      SUPABASE_PROJECT_REF: forbiddenValues[3],
      SUPABASE_ACCESS_TOKEN: forbiddenValues[4],
      SUPABASE_DB_PASSWORD: forbiddenValues[5],
      VERCEL_ACCESS_TOKEN: forbiddenValues[6],
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /RUN_LIVE_AI_SMOKE/);
    assert.match(result.stderr, /DEEPSEEK_API_KEY/);
    assert.match(result.stderr, /SILICONFLOW_API_KEY/);
    assert.match(result.stderr, /SUPABASE_SECRET_KEY/);
    assert.match(result.stderr, /SUPABASE_PROJECT_REF/);
    assert.match(result.stderr, /SUPABASE_ACCESS_TOKEN/);
    assert.match(result.stderr, /SUPABASE_DB_PASSWORD/);
    assert.match(result.stderr, /VERCEL_ACCESS_TOKEN/);
    for (const value of forbiddenValues) {
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(value));
    }
  });
});

test("CI 发布预检拒绝 Supabase CLI 返回的非本地实例", async () => {
  await withPreflightFixture(async (fixture) => {
    const cloudSecret = "sb_secret_must-not-export";
    await fixture.writePnpm(
      [
        "#!/bin/sh",
        "printf '%s\\n' 'API_URL=\"https://abcdefghijklmnopqrst.supabase.co\"'",
        "printf '%s\\n' 'PUBLISHABLE_KEY=\"sb_publishable_cloud\"'",
        `printf '%s\\n' 'SECRET_KEY="${cloudSecret}"'`,
      ].join("\n"),
    );

    const result = await runPreflight({
      PATH: fixture.path,
      GITHUB_ENV: fixture.githubEnvironmentPath,
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /必须指向本地 127\.0\.0\.1:54321/);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(cloudSecret));
    await assert.rejects(readFile(fixture.githubEnvironmentPath, "utf8"), {
      code: "ENOENT",
    });
  });
});

test("CI 发布预检只允许 GitHub Actions 的 CI 上下文", async () => {
  await withPreflightFixture(async (fixture) => {
    await fixture.writePnpm("#!/bin/sh\nexit 99\n");

    const result = await runPreflight({
      PATH: fixture.path,
      GITHUB_ENV: fixture.githubEnvironmentPath,
      CI: "false",
      GITHUB_ACTIONS: "false",
    });

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /CI=true/);
    assert.match(result.stderr, /GITHUB_ACTIONS=true/);
  });
});

async function withPreflightFixture(
  run: (fixture: {
    githubEnvironmentPath: string;
    path: string;
    writePnpm: (contents: string) => Promise<void>;
  }) => Promise<void>,
) {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "groundeddesk-ci-preflight-"),
  );
  try {
    await run({
      githubEnvironmentPath: join(temporaryDirectory, "github-env"),
      path: `${temporaryDirectory}${delimiter}${process.env.PATH ?? ""}`,
      writePnpm: (contents) =>
        writeFile(join(temporaryDirectory, "pnpm"), contents, { mode: 0o700 }),
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function runPreflight(
  environmentOverrides: Record<string, string | undefined> = {},
) {
  const child = spawn(process.execPath, ["scripts/check-ci-release.ts"], {
    cwd: projectDirectory,
    env: {
      CI: "true",
      GITHUB_ACTIONS: "true",
      NODE_ENV: "test",
      RUN_LIVE_AI_SMOKE: "false",
      ...environmentOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
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

  return { exitCode, stdout, stderr };
}
