import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const localSupabaseUrl = "http://127.0.0.1:54321";
const forbiddenEnvironmentNames = [
  "DEEPSEEK_API_KEY",
  "SILICONFLOW_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "VERCEL_ACCESS_TOKEN",
  "VERCEL_TEAM_ID",
  "VERCEL_PROJECT_ID",
  "VERCEL_DEPLOYMENT_ID",
  "VERCEL_DEPLOYMENT_URL",
  "CLOUD_SMOKE_QUESTION",
  "CLOUD_SMOKE_EXPECTED_SOURCE_TITLE",
] as const;

try {
  if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("仅允许在 CI=true 且 GITHUB_ACTIONS=true 时执行");
  }

  const githubEnvironmentPath = process.env.GITHUB_ENV;
  if (!githubEnvironmentPath) {
    throw new Error("缺少 GitHub Actions 环境文件路径");
  }

  const forbiddenConfiguration: string[] = forbiddenEnvironmentNames.filter(
    (name) => Boolean(process.env[name]),
  );
  if (process.env.RUN_LIVE_AI_SMOKE !== "false") {
    forbiddenConfiguration.unshift("RUN_LIVE_AI_SMOKE");
  }
  if (forbiddenConfiguration.length > 0) {
    throw new Error(
      `禁止 CI 使用以下生产或真实 AI 配置：${
        forbiddenConfiguration.join(", ")
      }`,
    );
  }

  const status = await readLocalSupabaseStatus();
  if (status.API_URL !== localSupabaseUrl) {
    throw new Error("Supabase API 必须指向本地 127.0.0.1:54321");
  }
  if (!status.PUBLISHABLE_KEY || !status.SECRET_KEY) {
    throw new Error("本地 Supabase 未提供 publishable key 或 secret key");
  }

  await appendFile(
    githubEnvironmentPath,
    [
      `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
      `SUPABASE_SECRET_KEY=${status.SECRET_KEY}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  process.stdout.write("CI 发布预检通过：使用当前本地 Supabase 配置。\n");
} catch (error) {
  const message = error instanceof Error ? error.message : "未知错误";
  process.stderr.write(`CI 发布预检失败：${message}\n`);
  process.exitCode = 1;
}

async function readLocalSupabaseStatus() {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "pnpm",
      ["exec", "supabase", "status", "-o", "env"],
      { encoding: "utf8" },
    ));
  } catch {
    throw new Error("无法读取本地 Supabase 状态");
  }

  return Object.fromEntries(
    stdout
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/u))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], parseEnvironmentValue(match[2] ?? "")]),
  );
}

function parseEnvironmentValue(value: string) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value) as string;
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
