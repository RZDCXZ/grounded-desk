import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  releaseChecks,
  type ReleaseCheck,
  type ReleaseEvidence,
} from "./release-evidence.ts";

const sectionTitles: Record<ReleaseCheck, string> = {
  "local-gate": "本地发布门槛",
  "live-ai-smoke": "真实 AI 冒烟",
  "supabase-cloud-deploy": "Supabase Cloud",
  "vercel-production-deploy": "Vercel Production",
  "cloud-smoke": "云端公开体验冒烟",
};

const summaryFields: Record<ReleaseCheck, Record<string, string>> = {
  "local-gate": {
    deterministic: "确定性检查",
    browser: "浏览器闭环",
  },
  "live-ai-smoke": {
    groundedAnswer: "有据回答",
    refusal: "可靠拒答",
    followUp: "多轮追问",
    providers: "真实供应商",
  },
  "supabase-cloud-deploy": {
    migrations: "迁移数量",
    configuration: "生产配置",
    initialization: "必要初始化",
    localSeed: "本地种子",
    projectRef: "项目引用",
  },
  "vercel-production-deploy": {
    deploymentUrl: "生产 URL",
    environment: "Vercel 环境",
  },
  "cloud-smoke": {
    publicPage: "公开页",
    embed: "嵌入入口",
    offline: "下线状态",
    expectedSourceTitle: "预期知识来源",
  },
};

try {
  const evidenceDirectory = process.env.RELEASE_EVIDENCE_DIR;
  if (!evidenceDirectory) {
    throw new Error("缺少 RELEASE_EVIDENCE_DIR");
  }
  const evidence = await Promise.all(
    releaseChecks.map((check) => readEvidence(evidenceDirectory, check)),
  );
  const sourceRevisions = new Set(
    evidence.map(({ sourceRevision }) => sourceRevision),
  );
  if (sourceRevisions.size !== 1) {
    throw new Error("五项发布证据并非来自同一源码版本");
  }
  const incomplete = evidence.filter(({ status }) => status !== "passed");
  if (incomplete.length > 0) {
    throw new Error(
      `发布证据未全部通过：${incomplete.map(({ check, status }) => `${check}=${status}`).join("、")}`,
    );
  }

  const sourceRevision = evidence[0]!.sourceRevision;
  const completedAt = evidence
    .map(({ completedAt: value }) => value)
    .toSorted()
    .at(-1)!;
  const outputPath = process.env.RELEASE_RECORD_OUTPUT
    ? resolve(process.env.RELEASE_RECORD_OUTPUT)
    : resolve(
        "docs/releases",
        `${completedAt.slice(0, 10)}-${sourceRevision.slice(0, 7)}.md`,
      );
  const sections = evidence.map((item) => renderEvidence(item)).join("\n\n");
  const record = [
    "# GroundedDesk 发布记录",
    "",
    `- 源码版本：\`${sourceRevision}\``,
    `- 完成时间：\`${completedAt}\``,
    "- 结论：本地门槛、真实供应商、Supabase Cloud、Vercel Production 与云端公开体验均通过。",
    "",
    sections,
    "",
  ].join("\n");

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, record, "utf8");
  process.stdout.write(`GroundedDesk 发布记录已生成：${outputPath}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "未知错误";
  process.stderr.write(`发布记录生成失败：${message}\n`);
  process.exitCode = 1;
}

async function readEvidence(directory: string, expectedCheck: ReleaseCheck) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await readFile(resolve(directory, `${expectedCheck}.json`), "utf8"),
    );
  } catch (error) {
    throw new Error(`无法读取 ${expectedCheck} 发布证据`, { cause: error });
  }
  if (!isReleaseEvidence(parsed) || parsed.check !== expectedCheck) {
    throw new Error(`${expectedCheck} 发布证据格式无效`);
  }
  return parsed;
}

function isReleaseEvidence(value: unknown): value is ReleaseEvidence {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ReleaseEvidence>;
  return candidate.schemaVersion === 1 &&
    releaseChecks.some((check) => check === candidate.check) &&
    ["passed", "failed", "skipped"].includes(candidate.status ?? "") &&
    typeof candidate.sourceRevision === "string" &&
    /^[0-9a-f]{40}$/u.test(candidate.sourceRevision) &&
    typeof candidate.completedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.completedAt)) &&
    typeof candidate.summary === "object" &&
    candidate.summary !== null &&
    Object.values(candidate.summary).every((item) =>
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    );
}

function renderEvidence(evidence: ReleaseEvidence) {
  const allowedFields = summaryFields[evidence.check];
  const details = Object.entries(allowedFields).flatMap(([name, label]) => {
    const value = evidence.summary[name];
    return value === undefined
      ? []
      : [`- ${label}：${sanitizeSummaryValue(value)}`];
  });

  return [
    `## ${sectionTitles[evidence.check]}`,
    "",
    `- 状态：${evidence.status.toUpperCase()}`,
    `- 完成时间：\`${evidence.completedAt}\``,
    ...details,
  ].join("\n");
}

function sanitizeSummaryValue(value: string | number | boolean) {
  return String(value).replace(/\s+/gu, " ").trim().slice(0, 500);
}
