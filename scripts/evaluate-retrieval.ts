import { runRetrievalEvaluation } from "../evaluations/retrieval/baseline.ts";

const jsonOutput = process.argv.slice(2).includes("--json");
const summary = await runRetrievalEvaluation();

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} else {
  printSummary(summary);
}

if (!summary.passed) {
  process.exitCode = 1;
}

function printSummary(summary: Awaited<ReturnType<typeof runRetrievalEvaluation>>) {
  const { config, dataset, outcomes, failures, byLanguage } = summary;

  process.stdout.write(
    [
      "GroundedDesk 检索离线评测",
      `配置：召回 ${config.candidateLimit}，重排保留 ${config.evidenceLimit}，相关性阈值 ${config.evidenceThreshold}`,
      `数据集：${dataset.total} 题（应答 ${dataset.answerable}，拒答 ${dataset.refusal}；中文 ${dataset.languages.zh}，英文 ${dataset.languages.en}）`,
      `结果：${outcomes.correct}/${dataset.total} 通过，通过率 ${(outcomes.passRate * 100).toFixed(1)}%`,
      `错误拒答 ${failures.falseRefusals}｜错误回答 ${failures.falseAnswers}｜来源外事实 ${failures.unsupportedFacts}`,
      `引用缺失 ${failures.missingCitations}｜非预期引用 ${failures.unexpectedCitations}｜语言不匹配 ${failures.languageMismatches}｜技术错误 ${failures.technicalErrors}`,
      `中文契约违规 ${byLanguage.zh.contractViolations}｜英文契约违规 ${byLanguage.en.contractViolations}`,
    ].join("\n") + "\n",
  );

  const failedCases = summary.cases.filter(({ passed }) => !passed);
  if (failedCases.length > 0) {
    process.stdout.write("失败题目：\n");
    for (const item of failedCases) {
      process.stdout.write(`- ${item.id}: ${item.failures.join(", ")}\n`);
    }
  }
}
