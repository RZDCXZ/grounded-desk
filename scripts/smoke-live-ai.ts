import { getKnowledgeEmbeddingProviderWithMetadata } from "../src/lib/ai/embeddings.ts";
import { getEvidenceCoverageProvider } from "../src/lib/ai/evidence-coverage-provider.ts";
import {
  getGroundedAnswerGenerationProvider,
  getGroundedAnswerRerankingProvider,
} from "../src/lib/ai/grounded-answer-providers.ts";
import {
  ProviderCallError,
  streamGroundedAnswer,
  type AiCallLog,
  type ConversationContextMessage,
  type GroundedAnswerDependencies,
  type GroundedCitation,
  type RetrievedContentUnit,
} from "../src/lib/assistant/grounded-answer.ts";
import { writeReleaseEvidence } from "./release-evidence.ts";

const smokeKnowledge: Array<RetrievedContentUnit> = [
  {
    id: "live-smoke-public-page",
    organizationId: "live-smoke-organization",
    knowledgeSourceId: "live-smoke-publishing-source",
    sourceTitle: "助手发布与网站接入",
    sourceUrl: "https://example.com/groundeddesk/publishing",
    heading: "公开页面",
    content: "GroundedDesk 发布后的助手可以通过公开页面直接访问。",
    similarity: 0,
  },
  {
    id: "live-smoke-embed",
    organizationId: "live-smoke-organization",
    knowledgeSourceId: "live-smoke-publishing-source",
    sourceTitle: "助手发布与网站接入",
    sourceUrl: "https://example.com/groundeddesk/publishing",
    heading: "网站嵌入",
    content: "GroundedDesk 的嵌入入口使用独立 iframe 隔离宿主网站样式。",
    similarity: 0,
  },
];

const smokeAssistant = {
  name: "GroundedDesk 冒烟助手",
  serviceScope: "验证真实 AI 供应商的有据回答、可靠拒答与多轮追问。",
  tone: "concise",
  humanContactLabel: "联系维护者",
  humanContactUrl: "mailto:admin@groundeddesk.local",
};

let currentStage = "配置检查";
let currentProviderIdentity: { provider: string; model: string } | null = null;

if (process.env.RUN_LIVE_AI_SMOKE !== "true") {
  process.stderr.write(
    "真实 AI 冒烟会消耗真实模型额度；确认后设置 RUN_LIVE_AI_SMOKE=true 再运行。\n",
  );
  await writeReleaseEvidence("live-ai-smoke", "failed", {
    failure: "RUN_LIVE_AI_SMOKE 未显式启用",
  });
  process.exitCode = 1;
} else {
  const missingVariables = missingLiveProviderVariables();

  if (missingVariables.length > 0) {
    process.stdout.write(
      `GroundedDesk 真实 AI 冒烟已跳过：缺少服务端环境变量 ${missingVariables.join("、")}\n`,
    );
    await writeReleaseEvidence("live-ai-smoke", "skipped", {
      missingVariables: missingVariables.join(","),
    });
  } else {
    try {
      const result = await runLiveAiSmoke();
      await writeReleaseEvidence("live-ai-smoke", "passed", {
        groundedAnswer: "passed",
        refusal: "passed",
        followUp: "passed",
        providers: "SiliconFlow Embedding/Rerank + DeepSeek",
        totalTokens: result.totalTokens,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      const providerIdentity = readCurrentProviderIdentity();
      const providerDiagnostic = providerIdentity
        ? `；provider=${providerIdentity.provider}；model=${providerIdentity.model}`
        : "";
      const diagnostic = error instanceof ProviderCallError
        ? `；errorType=${error.errorType}；traceId=${error.traceId}`
        : "";
      process.stderr.write(
        `真实 AI 冒烟失败 [${currentStage}]：${message}${providerDiagnostic}${diagnostic}\n`,
      );
      await writeReleaseEvidence("live-ai-smoke", "failed", {
        stage: currentStage,
        errorType: error instanceof ProviderCallError
          ? error.errorType
          : "unknown",
      });
      process.exitCode = 1;
    }
  }
}

function readCurrentProviderIdentity() {
  return currentProviderIdentity;
}

async function runLiveAiSmoke() {
  assertLiveProviderConfiguration();

  const embeddingProvider = getKnowledgeEmbeddingProviderWithMetadata();
  currentStage = "知识来源向量化";
  currentProviderIdentity = embeddingProvider;
  const knowledgeEmbeddingResult = await embeddingProvider.embed(
    smokeKnowledge.map(({ content }) => content),
  );
  if (
    knowledgeEmbeddingResult.value.length !== smokeKnowledge.length ||
    knowledgeEmbeddingResult.value.some(
      (embedding) => embedding.length !== 1_024,
    )
  ) {
    throw new Error("向量服务未返回完整的 1024 维知识向量");
  }

  const embeddedKnowledge = smokeKnowledge.map((contentUnit, index) => ({
    contentUnit,
    embedding: knowledgeEmbeddingResult.value[index]!,
  }));
  const rerankingProvider = getGroundedAnswerRerankingProvider();
  const generationProvider = getGroundedAnswerGenerationProvider();
  const coverageProvider = getEvidenceCoverageProvider();
  const callLogs: AiCallLog[] = [];
  const dependencies: GroundedAnswerDependencies = {
    questionEmbeddingProvider: {
      provider: embeddingProvider.provider,
      model: embeddingProvider.model,
      async embed(question) {
        currentProviderIdentity = embeddingProvider;
        const result = await embeddingProvider.embed([question]);
        const embedding = result.value[0];
        if (!embedding || embedding.length !== 1_024) {
          throw new Error("向量服务未返回预期的 1024 维问题向量");
        }
        return { ...result, value: embedding };
      },
    },
    candidateRepository: {
      async retrieve(_organizationId, questionEmbedding, limit) {
        return embeddedKnowledge
          .map(({ contentUnit, embedding }) => ({
            ...contentUnit,
            similarity: cosineSimilarity(questionEmbedding, embedding),
          }))
          .toSorted((left, right) => right.similarity - left.similarity)
          .slice(0, limit);
      },
    },
    rerankingProvider: {
      provider: rerankingProvider.provider,
      model: rerankingProvider.model,
      async rerank(question, candidates) {
        currentProviderIdentity = rerankingProvider;
        return rerankingProvider.rerank(question, candidates);
      },
    },
    evidenceCoverageProvider: {
      provider: coverageProvider.provider,
      model: coverageProvider.model,
      async decide(input) {
        currentProviderIdentity = coverageProvider;
        return coverageProvider.decide(input);
      },
    },
    answerProvider: {
      provider: generationProvider.provider,
      model: generationProvider.model,
      streamAnswer(input) {
        currentProviderIdentity = generationProvider;
        return generationProvider.streamAnswer(input);
      },
    },
    callLogger: {
      async record(log) {
        callLogs.push(log);
      },
    },
    config: {
      candidateLimit: smokeKnowledge.length,
      evidenceLimit: smokeKnowledge.length,
      rerankNoiseFloor: 0.05,
    },
  };

  currentStage = "有据回答";
  const groundedAnswer = await runScenario(
    "GroundedDesk 发布后的助手可以从哪里访问？",
    dependencies,
  );
  assertGroundedScenario(
    groundedAnswer,
    "GroundedDesk 发布后的助手可以通过公开页面直接访问。",
    "助手发布与网站接入",
  );

  currentStage = "可靠拒答";
  const refusal = await runScenario(
    "GroundedDesk 的年度营收是多少？",
    dependencies,
  );
  if (
    refusal.resultType !== "grounded_refusal" ||
    refusal.answer.length > 0 ||
    refusal.citations.length > 0 ||
    !refusal.refusalMessage
  ) {
    throw new Error("无依据问题没有形成不含来源外事实的可靠拒答");
  }

  currentStage = "多轮追问";
  const context: ConversationContextMessage[] = [
    {
      role: "visitor",
      content: "GroundedDesk 发布后的助手可以从哪里访问？",
    },
    {
      role: "assistant",
      content: groundedAnswer.answer,
      resultType: "grounded_answer",
    },
  ];
  const followUp = await runScenario(
    "它嵌入个人网站时如何隔离样式？",
    dependencies,
    context,
  );
  assertGroundedScenario(
    followUp,
    "GroundedDesk 的嵌入入口使用独立 iframe 隔离宿主网站样式。",
    "助手发布与网站接入",
  );

  const successfulCallTypes = new Set(
    callLogs
      .filter(({ outcome }) => outcome === "success")
      .map(({ callType }) => callType),
  );
  for (const callType of [
    "embedding",
    "rerank",
    "evidence_coverage",
    "answer",
  ] as const) {
    if (!successfulCallTypes.has(callType)) {
      throw new Error(`完整链路缺少成功的 ${callType} 调用`);
    }
  }

  const totalTokens =
    knowledgeEmbeddingResult.tokens.total +
    callLogs.reduce((total, { totalTokens: tokens }) => total + tokens, 0);

  process.stdout.write(
    [
      "GroundedDesk 真实 AI 冒烟通过",
      `向量：${embeddingProvider.provider}/${embeddingProvider.model}，${smokeKnowledge.length} 个知识来源内容单元`,
      `重排：${rerankingProvider.provider}/${rerankingProvider.model}`,
      `生成与证据覆盖：${generationProvider.provider}/${generationProvider.model}`,
      "有据回答：PASS，引用预期知识来源“助手发布与网站接入”",
      "可靠拒答：PASS，未生成正文或引用",
      "多轮追问：PASS，携带近期会话并重新执行检索",
      `用量：完整链路 ${totalTokens} tokens`,
    ].join("\n") + "\n",
  );
  return { totalTokens };
}

type ScenarioResult = {
  answer: string;
  refusalMessage: string | null;
  resultType:
    | "grounded_answer"
    | "grounded_refusal"
    | "knowledge_conflict"
    | "conversational_response"
    | "clarification_request"
    | "human_handoff"
    | null;
  citations: GroundedCitation[];
};

async function runScenario(
  question: string,
  dependencies: GroundedAnswerDependencies,
  context: ConversationContextMessage[] = [],
): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    answer: "",
    refusalMessage: null,
    resultType: null,
    citations: [],
  };

  for await (const event of streamGroundedAnswer(
    {
      organizationId: "live-smoke-organization",
      question,
      context,
      assistant: smokeAssistant,
    },
    dependencies,
  )) {
    if (event.type === "text_delta") {
      result.answer += event.delta;
    } else if (event.type === "refusal") {
      result.resultType = event.resultType;
      result.refusalMessage = event.message;
    } else if (event.type === "complete") {
      result.resultType = event.resultType;
      result.citations = event.citations;
    }
  }

  return result;
}

function assertGroundedScenario(
  result: ScenarioResult,
  expectedAnswer: string,
  expectedSourceTitle: string,
) {
  if (
    result.resultType !== "grounded_answer" ||
    result.answer.trim() !== expectedAnswer
  ) {
    throw new Error("应答问题没有形成有据回答");
  }
  if (
    !result.citations.some(
      ({ title }) => title === expectedSourceTitle,
    )
  ) {
    throw new Error(`有据回答未引用预期知识来源“${expectedSourceTitle}”`);
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function assertLiveProviderConfiguration() {
  if (
    process.env.DETERMINISTIC_AI === "true" ||
    process.env.DETERMINISTIC_EMBEDDINGS === "true"
  ) {
    throw new Error("真实 AI 冒烟不能启用确定性供应商");
  }

}

function missingLiveProviderVariables() {
  return ["DEEPSEEK_API_KEY", "SILICONFLOW_API_KEY"].filter(
    (name) => !process.env[name],
  );
}
