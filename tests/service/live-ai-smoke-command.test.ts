import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

test("真实 AI 冒烟未显式授权时在调用供应商前停止", async () => {
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "scripts/smoke-live-ai.ts"],
    {
      cwd: projectDirectory,
      env: {
        ...process.env,
        RUN_LIVE_AI_SMOKE: "false",
        DEEPSEEK_API_KEY: "must-not-be-used",
        SILICONFLOW_API_KEY: "must-not-be-used",
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
  assert.match(stderr, /RUN_LIVE_AI_SMOKE=true/);
  assert.match(stderr, /真实模型额度/);
});
