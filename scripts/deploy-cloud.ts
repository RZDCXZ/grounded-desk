import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { writeReleaseEvidence } from "./release-evidence.ts";

const projectDirectory = resolve(import.meta.dirname, "..");
const projectReference = process.env.SUPABASE_PROJECT_REF ?? "";
const dryRun = process.env.CLOUD_RELEASE_DRY_RUN === "true";

const steps = [
  {
    label: "1. 云端发布预检",
    display: "node scripts/check-cloud-release.ts",
    command: [process.execPath, "scripts/check-cloud-release.ts"],
  },
  {
    label: "2. Supabase 项目连接",
    display: `supabase link --project-ref ${projectReference || "<project-ref>"}`,
    command: [
      "pnpm",
      "exec",
      "supabase",
      "link",
      "--project-ref",
      projectReference,
    ],
  },
  {
    label: "3. 迁移 dry-run",
    display: "supabase db push --dry-run",
    command: ["pnpm", "exec", "supabase", "db", "push", "--dry-run"],
  },
  {
    label: "4. 推送版本化迁移",
    display: "supabase db push",
    command: ["pnpm", "exec", "supabase", "db", "push"],
  },
] as const;

try {
  for (const step of steps) {
    announce(step.label, step.display);
    if (!dryRun) {
      await runCommand(step.command);
    }
  }

  announce("5. 推送临时渲染的生产配置", "supabase config push");
  if (!dryRun) {
    await withRenderedProductionConfig(async (workDirectory) => {
      await runCommand([
        "pnpm",
        "exec",
        "supabase",
        "--workdir",
        workDirectory,
        "config",
        "push",
        "--project-ref",
        projectReference,
      ]);
    });
  }

  announce("6. 执行必要初始化", "node scripts/bootstrap-cloud.ts");
  if (!dryRun) {
    await runCommand([process.execPath, "scripts/bootstrap-cloud.ts"]);
  }

  process.stdout.write(
    dryRun
      ? "云端发布计划检查通过（未连接或修改远端）\n"
      : "GroundedDesk Supabase Cloud 发布通过\n",
  );
  if (!dryRun) {
    await writeReleaseEvidence("supabase-cloud-deploy", "passed", {
      migrations: (
        await readdir(resolve(projectDirectory, "supabase/migrations"))
      ).filter((name) => name.endsWith(".sql")).length,
      configuration: "supabase/config.production.toml",
      initialization: "administrator+organization+draft-assistant",
      localSeed: "excluded",
      projectRef: projectReference,
    });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "未知错误";
  if (!dryRun) {
    await writeReleaseEvidence("supabase-cloud-deploy", "failed", {
      failure: message.slice(0, 300),
    });
  }
  process.stderr.write(`Supabase Cloud 发布失败：${message}\n`);
  process.exitCode = 1;
}

function announce(label: string, display: string) {
  process.stdout.write(`${label}\n   ${display}\n`);
}

async function runCommand(command: readonly string[]) {
  const [executable, ...arguments_] = command;
  if (!executable) {
    throw new Error("发布命令为空");
  }

  const child = spawn(executable, arguments_, {
    cwd: projectDirectory,
    env: process.env,
    stdio: "inherit",
  });
  const exitCode = await new Promise<number>((resolveCode, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveCode(code ?? -1));
  });
  if (exitCode !== 0) {
    throw new Error(`步骤以状态 ${exitCode} 退出`);
  }
}

async function withRenderedProductionConfig(
  operation: (workDirectory: string) => Promise<void>,
) {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "groundeddesk-cloud-config-"),
  );
  const supabaseDirectory = join(temporaryDirectory, "supabase");
  const templateDirectory = join(supabaseDirectory, "templates");

  try {
    await mkdir(templateDirectory, { recursive: true });
    const template = await readFile(
      resolve(projectDirectory, "supabase/config.production.toml"),
      "utf8",
    );
    const rendered = template
      .replaceAll("__SUPABASE_PROJECT_REF__", projectReference)
      .replaceAll("__APP_URL__", process.env.APP_URL ?? "")
      .replaceAll("__EMBED_APP_URL__", process.env.EMBED_APP_URL ?? "");
    if (/__[A-Z0-9_]+__/u.test(rendered)) {
      throw new Error("生产 Supabase 配置仍含未解析占位符");
    }
    await writeFile(join(supabaseDirectory, "config.toml"), rendered, "utf8");
    await copyFile(
      resolve(projectDirectory, "supabase/templates/magic-link.html"),
      join(templateDirectory, "magic-link.html"),
    );
    await operation(temporaryDirectory);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
