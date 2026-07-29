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
