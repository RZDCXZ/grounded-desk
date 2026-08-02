import { spawn } from "node:child_process";

import { writeReleaseEvidence } from "./release-evidence.ts";

const checks = [
  {
    name: "deterministic",
    command: ["pnpm", "test:deterministic"],
  },
  {
    name: "browser",
    command: ["pnpm", "test:e2e:browser"],
  },
] as const;

try {
  for (const check of checks) {
    const exitCode = await runCommand(check.command);
    if (exitCode !== 0) {
      await writeReleaseEvidence("local-gate", "failed", {
        failedCheck: check.name,
      });
      process.exitCode = exitCode;
      break;
    }
  }

  if (!process.exitCode) {
    await writeReleaseEvidence("local-gate", "passed", {
      deterministic: "passed",
      browser: "passed",
    });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "未知错误";
  await writeReleaseEvidence("local-gate", "failed", {
    failure: message.slice(0, 300),
  });
  process.stderr.write(`本地发布门槛失败：${message}\n`);
  process.exitCode = 1;
}

async function runCommand(command: readonly string[]) {
  const [executable, ...arguments_] = command;
  if (!executable) {
    throw new Error("本地发布命令为空");
  }
  const child = spawn(executable, arguments_, {
    env: process.env,
    stdio: "inherit",
  });
  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });
}
