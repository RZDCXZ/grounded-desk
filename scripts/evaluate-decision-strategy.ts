import { runDecisionEvaluation } from "../evaluations/decision/evaluate.ts";
import {
  createDecisionLiveReleaseReport,
  writeDecisionLiveReleaseReport,
} from "../evaluations/decision/report.ts";
import {
  runRetrievalEvaluation,
} from "../evaluations/retrieval/baseline.ts";

const liveMode = process.argv.includes("--live");
const writeReport = process.argv.includes("--write-report");
const caseIds = process.argv
  .filter((argument) => argument.startsWith("--case="))
  .flatMap((argument) =>
    argument.slice("--case=".length).split(",").filter(Boolean)
  );
if (liveMode && process.env.RUN_LIVE_AI_SMOKE !== "true") {
  throw new Error(
    "真实决策评测需要显式设置 RUN_LIVE_AI_SMOKE=true",
  );
}
if (writeReport && (!liveMode || caseIds.length > 0)) {
  throw new Error(
    "--write-report 只能与 --live 一起对完整固定评测集使用",
  );
}
const summary = await runDecisionEvaluation(
  liveMode ? "live" : "contract",
  caseIds,
);
let reportPath: string | undefined;
if (writeReport) {
  const retrievalBaseline = await runRetrievalEvaluation();
  const report = await createDecisionLiveReleaseReport(
    summary,
    retrievalBaseline,
  );
  reportPath = await writeDecisionLiveReleaseReport(report);
}

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} else {
  const lines = [
    `决策评测集：${summary.dataset.version}（${summary.dataset.total} 条）`,
    `响应策略：${summary.strategy.version}`,
    `评测模式：${summary.strategy.evaluationMode}`,
    `生产契约指纹：${summary.strategy.contractFingerprint}`,
    `评测器指纹：${summary.strategy.evaluatorFingerprint}`,
    `评测器版本：${summary.strategy.evaluatorVersion}`,
    `发布门槛：${summary.gate.passed ? "通过" : "未通过"}`,
    `诉求拆分错误：${summary.failures.requestSplitErrors}（漏拆 ${summary.failures.missedRequestSplits} / 错拆 ${summary.failures.wrongRequestSplits} / 不必要拆分 ${summary.failures.unnecessaryRequestSplits}）`,
    `覆盖判定错误：${summary.failures.coverageErrors}`,
    `错误回答：${summary.failures.wrongAnswers}`,
    `错误拒答：${summary.failures.wrongRefusals}`,
    `部分回答错误：${summary.failures.partialAnswerErrors}`,
    `遗漏冲突 / 误判冲突：${summary.failures.missedConflicts} / ${summary.failures.falseConflicts}`,
    `不必要澄清 / 错误转人工：${summary.failures.unnecessaryClarifications} / ${summary.failures.wrongHandoffs}`,
    `错误待解决问题：${summary.failures.wrongUnresolvedQuestions}`,
    `语言不匹配：${summary.failures.languageMismatches}`,
    `安全契约（来源外事实 / 不可验证证据 / 错误引用 / 技术故障伪装拒答）：${summary.safety.unsupportedFacts} / ${summary.safety.unverifiableEvidence} / ${summary.safety.wrongCitations} / ${summary.safety.technicalFailuresAsRefusals}`,
    `旧策略→新策略（错误回答）：${summary.comparison.legacyWrongAnswers}→${summary.comparison.newWrongAnswers}`,
    `旧策略→新策略（错误拒答）：${summary.comparison.legacyWrongRefusals}→${summary.comparison.newWrongRefusals}`,
    `调用次数（分析 / 向量 / 重排 / 覆盖 / 回答）：${summary.calls.requestAnalysis.count} / ${summary.calls.embedding.count} / ${summary.calls.rerank.count} / ${summary.calls.evidenceCoverage.count} / ${summary.calls.answer.count}`,
    `评测调用总耗时：${summary.calls.totalDurationMs}ms`,
    `外部瞬态重采样：${summary.cases.reduce((total, item) => total + item.attempts - 1, 0)} 次`,
    `检索基线：${summary.gate.retrievalBaselineRequired ? "仍为发布前置条件" : "未要求"}`,
    ...(reportPath ? [`发布报告：${reportPath}`] : []),
  ];

  const failedCases = summary.cases.filter(({ passed }) => !passed);
  if (failedCases.length > 0) {
    lines.push(
      `失败用例：${failedCases.map(({ id, failures }) => `${id}(${failures.join(",")})`).join("；")}`,
    );
  }
  if (summary.gate.failedRequirements.length > 0) {
    lines.push(
      `未满足门槛：${summary.gate.failedRequirements.join(", ")}`,
    );
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

if (!summary.gate.passed) {
  process.exitCode = 1;
}
