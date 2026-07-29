import "server-only";

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
