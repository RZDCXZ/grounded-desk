import "server-only";

const VERCEL_PREVIEW_HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/;

export function readIntegerServerConfig(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = Number(environment[name] ?? fallback);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`服务端配置 ${name} 必须是 ${minimum}–${maximum} 的整数`);
  }

  return value;
}

export function readNumberServerConfig(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = Number(environment[name] ?? fallback);

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`服务端配置 ${name} 必须介于 ${minimum} 和 ${maximum}`);
  }

  return value;
}

export function getApplicationUrl(
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (environment.VERCEL_ENV === "preview") {
    return getVercelPreviewOrigin(environment);
  }

  const configuredUrl =
    environment.APP_URL ??
    (environment.NODE_ENV === "production"
      ? undefined
      : "http://127.0.0.1:3000");

  if (!configuredUrl) {
    throw new Error("缺少生产环境变量 APP_URL");
  }

  return readHttpOrigin(configuredUrl, "APP_URL");
}

export function getAuthConfirmationUrl(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return new URL("/auth/confirm", getApplicationUrl(environment)).href;
}

export function getEmbedApplicationUrl(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const applicationUrl = getApplicationUrl(environment);
  let configuredUrl = environment.EMBED_APP_URL;

  if (!configuredUrl && environment.NODE_ENV !== "production") {
    const localEmbedUrl = new URL(applicationUrl);
    localEmbedUrl.hostname =
      localEmbedUrl.hostname === "localhost" ? "127.0.0.1" : "localhost";
    configuredUrl = localEmbedUrl.origin;
  }

  if (!configuredUrl) {
    throw new Error("缺少生产环境变量 EMBED_APP_URL");
  }

  const embedApplicationUrl = readHttpOrigin(
    configuredUrl,
    "EMBED_APP_URL",
  );

  if (embedApplicationUrl === applicationUrl) {
    throw new Error("服务端配置 EMBED_APP_URL 必须与 APP_URL 使用不同来源");
  }

  return embedApplicationUrl;
}

function readHttpOrigin(value: string, name: string) {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`服务端配置 ${name} 必须使用 HTTP 或 HTTPS`);
  }

  return url.origin;
}

function getVercelPreviewOrigin(environment: NodeJS.ProcessEnv) {
  if (environment.VERCEL !== "1") {
    throw new Error("Vercel Preview 必须提供系统环境变量 VERCEL=1");
  }

  if (environment.VERCEL_TARGET_ENV !== "preview") {
    throw new Error(
      "Vercel Preview 必须提供系统环境变量 VERCEL_TARGET_ENV=preview",
    );
  }

  const hostname = environment.VERCEL_BRANCH_URL;

  if (!hostname || !VERCEL_PREVIEW_HOSTNAME.test(hostname)) {
    throw new Error(
      "Vercel Preview 的系统环境变量 VERCEL_BRANCH_URL 必须是裸 vercel.app 主机名",
    );
  }

  if (hostname === environment.VERCEL_PROJECT_PRODUCTION_URL) {
    throw new Error("Vercel Preview 的分支地址不能等于 Production 地址");
  }

  return `https://${hostname}`;
}
