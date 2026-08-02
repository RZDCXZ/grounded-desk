import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const projectDirectory = resolve(import.meta.dirname, "..");

try {
  const result = await checkCloudRelease(process.env);
  process.stdout.write([
    "GroundedDesk 云端发布预检通过",
    `版本化迁移：${result.migrationCount} 个`,
    "生产配置：supabase/config.production.toml",
    "必要初始化：scripts/bootstrap-cloud.ts（仅管理员、组织成员关系和草稿助手）",
    "本地种子：EXCLUDED (supabase/seed.sql)",
    "本地业务数据：EXCLUDED",
    "Vercel 服务端密钥：PASS",
  ].join("\n") + "\n");
} catch (error) {
  const message = error instanceof Error ? error.message : "未知错误";
  process.stderr.write(`云端发布预检失败：${message}\n`);
  process.exitCode = 1;
}

async function checkCloudRelease(environment: NodeJS.ProcessEnv) {
  const errors: string[] = [];
  const requiredVariables = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_PROJECT_REF",
    "APP_URL",
    "EMBED_APP_URL",
    "ADMIN_EMAIL",
    "DEEPSEEK_API_KEY",
    "SILICONFLOW_API_KEY",
  ] as const;

  for (const name of requiredVariables) {
    if (!environment[name]?.trim()) {
      errors.push(`缺少 ${name}`);
    }
  }

  if (environment.NODE_ENV !== "production") {
    errors.push("NODE_ENV 必须是 production");
  }
  for (const name of [
    "DETERMINISTIC_AI",
    "DETERMINISTIC_EMBEDDINGS",
    "ALLOW_PRIVATE_WEB_SOURCES",
  ]) {
    if (environment[name] === "true") {
      errors.push(`${name} 在生产环境必须关闭`);
    }
  }
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_DEEPSEEK_API_KEY",
    "NEXT_PUBLIC_SILICONFLOW_API_KEY",
  ]) {
    if (environment[name]) {
      errors.push(`禁止公开服务端密钥变量 ${name}`);
    }
  }

  const supabaseOrigin = validateCloudSupabaseUrl(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    errors,
  );
  validateKeyPrefix(
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "sb_publishable_",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    errors,
  );
  validateKeyPrefix(
    environment.SUPABASE_SECRET_KEY,
    "sb_secret_",
    "SUPABASE_SECRET_KEY",
    errors,
  );
  validateProjectReference(environment.SUPABASE_PROJECT_REF, errors);
  if (
    supabaseOrigin &&
    environment.SUPABASE_PROJECT_REF &&
    new URL(supabaseOrigin).hostname !==
      `${environment.SUPABASE_PROJECT_REF}.supabase.co`
  ) {
    errors.push(
      "SUPABASE_PROJECT_REF 与 NEXT_PUBLIC_SUPABASE_URL 不匹配",
    );
  }
  const applicationOrigin = validateHttpsOrigin(
    environment.APP_URL,
    "APP_URL",
    errors,
  );
  const embedOrigin = validateHttpsOrigin(
    environment.EMBED_APP_URL,
    "EMBED_APP_URL",
    errors,
  );
  if (applicationOrigin && embedOrigin && applicationOrigin === embedOrigin) {
    errors.push("APP_URL 与 EMBED_APP_URL 必须使用不同来源");
  }
  if (
    environment.ADMIN_EMAIL &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(environment.ADMIN_EMAIL)
  ) {
    errors.push("ADMIN_EMAIL 不是有效邮箱地址");
  }

  const migrationDirectory = resolve(
    projectDirectory,
    "supabase/migrations",
  );
  const migrationCount = (await readdir(migrationDirectory)).filter(
    (name) => /^\d+_[a-z0-9_]+\.sql$/u.test(name),
  ).length;
  if (migrationCount === 0) {
    errors.push("没有可发布的版本化迁移");
  }
  await requireFile("supabase/config.production.toml", errors);
  await requireFile("supabase/templates/magic-link.html", errors);
  await requireFile("scripts/bootstrap-cloud.ts", errors);

  if (errors.length > 0) {
    throw new Error(errors.join("；"));
  }

  return { migrationCount };
}

function validateCloudSupabaseUrl(value: string | undefined, errors: string[]) {
  const origin = validateHttpsOrigin(
    value,
    "NEXT_PUBLIC_SUPABASE_URL",
    errors,
  );
  if (origin && !new URL(origin).hostname.endsWith(".supabase.co")) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL 必须指向 Supabase Cloud");
  }
  return origin;
}

function validateKeyPrefix(
  value: string | undefined,
  prefix: string,
  name: string,
  errors: string[],
) {
  if (value && !value.startsWith(prefix)) {
    errors.push(`${name} 必须使用 ${prefix} 格式`);
  }
}

function validateProjectReference(
  value: string | undefined,
  errors: string[],
) {
  if (value && !/^[a-z]{20}$/u.test(value)) {
    errors.push("SUPABASE_PROJECT_REF 必须是 20 位小写项目引用");
  }
}

function validateHttpsOrigin(
  value: string | undefined,
  name: string,
  errors: string[],
) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== value.replace(/\/$/u, "")) {
      errors.push(`${name} 必须是 HTTPS 来源且不能包含路径`);
      return null;
    }
    return url.origin;
  } catch {
    errors.push(`${name} 不是有效 URL`);
    return null;
  }
}

async function requireFile(relativePath: string, errors: string[]) {
  try {
    if (!(await stat(resolve(projectDirectory, relativePath))).isFile()) {
      errors.push(`缺少发布资产 ${relativePath}`);
    }
  } catch {
    errors.push(`缺少发布资产 ${relativePath}`);
  }
}
