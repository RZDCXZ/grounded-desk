import {
  readReleaseSourceRevision,
  writeReleaseEvidence,
} from "./release-evidence.ts";

type VercelDeployment = {
  id?: unknown;
  projectId?: unknown;
  readyState?: unknown;
  target?: unknown;
  url?: unknown;
  alias?: unknown;
  meta?: unknown;
};

try {
  const deploymentUrl = process.env.VERCEL_DEPLOYMENT_URL;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const accessToken = process.env.VERCEL_ACCESS_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (
    !deploymentUrl ||
    !deploymentId ||
    !projectId ||
    !accessToken ||
    !teamId
  ) {
    throw new Error(
      "缺少 VERCEL_DEPLOYMENT_URL、VERCEL_DEPLOYMENT_ID、VERCEL_PROJECT_ID、VERCEL_ACCESS_TOKEN 或 VERCEL_TEAM_ID",
    );
  }
  const url = new URL(deploymentUrl);
  if (!isAllowedUrl(url)) {
    throw new Error("VERCEL_DEPLOYMENT_URL 必须是 HTTPS 来源");
  }
  if (url.origin !== deploymentUrl.replace(/\/$/u, "")) {
    throw new Error("VERCEL_DEPLOYMENT_URL 不能包含路径");
  }
  if (!deploymentId.startsWith("dpl_") || !projectId.startsWith("prj_")) {
    throw new Error("Vercel deployment ID 或 project ID 格式无效");
  }
  if (!teamId.startsWith("team_")) {
    throw new Error("VERCEL_TEAM_ID 格式无效");
  }

  const apiBaseUrl = new URL(
    process.env.VERCEL_API_BASE_URL ?? "https://api.vercel.com",
  );
  if (!isAllowedUrl(apiBaseUrl)) {
    throw new Error("VERCEL_API_BASE_URL 必须使用 HTTPS");
  }
  const apiUrl = new URL(
    `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    apiBaseUrl,
  );
  apiUrl.searchParams.set("teamId", teamId);
  const apiResponse = await fetch(apiUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!apiResponse.ok) {
    throw new Error(`Vercel API 返回 HTTP ${apiResponse.status}`);
  }
  const deployment = await readDeployment(apiResponse);
  const sourceRevision = readReleaseSourceRevision();
  validateDeployment(
    deployment,
    { deploymentId, projectId, sourceRevision, deploymentHost: url.host },
  );

  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Vercel Production 返回 HTTP ${response.status}`);
  }
  await writeReleaseEvidence("vercel-production-deploy", "passed", {
    deploymentUrl: url.origin,
    deploymentId,
    projectId,
    environment: "production",
  });
  process.stdout.write(
    `GroundedDesk Vercel Production 验证通过：${url.origin}\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "未知错误";
  await writeReleaseEvidence("vercel-production-deploy", "failed", {
    failure: message.slice(0, 300),
  });
  process.stderr.write(`Vercel Production 验证失败：${message}\n`);
  process.exitCode = 1;
}

function isAllowedUrl(url: URL) {
  if (url.protocol === "https:") {
    return true;
  }
  return process.env.NODE_ENV === "test" &&
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
}

async function readDeployment(response: Response): Promise<VercelDeployment> {
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null) {
      throw new Error("响应不是对象");
    }
    return value;
  } catch (error) {
    throw new Error("Vercel API 返回了无效部署数据", { cause: error });
  }
}

function validateDeployment(
  deployment: VercelDeployment,
  expected: {
    deploymentId: string;
    projectId: string;
    sourceRevision: string;
    deploymentHost: string;
  },
) {
  if (deployment.id !== expected.deploymentId) {
    throw new Error("Vercel API 返回的 deployment ID 不匹配");
  }
  if (deployment.projectId !== expected.projectId) {
    throw new Error("Vercel API 返回的 project ID 不匹配");
  }
  if (deployment.readyState !== "READY" || deployment.target !== "production") {
    throw new Error("Vercel 部署尚未处于 READY Production 状态");
  }
  const metadata = typeof deployment.meta === "object" &&
      deployment.meta !== null
    ? deployment.meta as Record<string, unknown>
    : {};
  const deployedRevision = [
    metadata.githubCommitSha,
    metadata.gitlabCommitSha,
    metadata.bitbucketCommitSha,
  ].find((value): value is string => typeof value === "string");
  if (deployedRevision !== expected.sourceRevision) {
    throw new Error("Vercel 部署源码版本与 RELEASE_SOURCE_REVISION 不一致");
  }
  const deploymentHosts = [
    typeof deployment.url === "string" ? deployment.url : null,
    ...(Array.isArray(deployment.alias)
      ? deployment.alias.filter((value): value is string =>
        typeof value === "string"
      )
      : []),
  ];
  if (!deploymentHosts.includes(expected.deploymentHost)) {
    throw new Error("VERCEL_DEPLOYMENT_URL 不属于该 Vercel deployment");
  }
}
