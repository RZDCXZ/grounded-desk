import { writeReleaseEvidence } from "./release-evidence.ts";

try {
  const deploymentUrl = process.env.VERCEL_DEPLOYMENT_URL;
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!deploymentUrl || !deploymentId || !projectId) {
    throw new Error(
      "缺少 VERCEL_DEPLOYMENT_URL、VERCEL_DEPLOYMENT_ID 或 VERCEL_PROJECT_ID",
    );
  }
  const url = new URL(deploymentUrl);
  if (url.protocol !== "https:") {
    throw new Error("VERCEL_DEPLOYMENT_URL 必须使用 HTTPS");
  }
  if (!deploymentId.startsWith("dpl_") || !projectId.startsWith("prj_")) {
    throw new Error("Vercel deployment ID 或 project ID 格式无效");
  }

  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Vercel Production 返回 HTTP ${response.status}`);
  }
  await writeReleaseEvidence("vercel-production-deploy", "passed", {
    deploymentUrl: url.origin,
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
