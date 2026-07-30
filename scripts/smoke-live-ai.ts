import { getKnowledgeEmbeddingProviderWithMetadata } from "../src/lib/ai/embeddings.ts";
import {
  getGroundedAnswerGenerationProvider,
  getGroundedAnswerRerankingProvider,
} from "../src/lib/ai/grounded-answer-providers.ts";

if (process.env.RUN_LIVE_AI_SMOKE !== "true") {
  process.stderr.write(
    "真实 AI 冒烟会消耗真实模型额度；确认后设置 RUN_LIVE_AI_SMOKE=true 再运行。\n",
  );
  process.exitCode = 1;
} else {
  try {
    await runLiveAiSmoke();
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    process.stderr.write(`真实 AI 冒烟失败：${message}\n`);
    process.exitCode = 1;
  }
}

async function runLiveAiSmoke() {
  assertLiveProviderConfiguration();

  const embeddingProvider = getKnowledgeEmbeddingProviderWithMetadata();
  const embeddingResult = await embeddingProvider.embed([
    "GroundedDesk 用知识来源支持可核查的有据回答。",
  ]);
  const embedding = embeddingResult.value[0];

  if (!embedding || embedding.length !== 1024) {
    throw new Error("向量服务未返回预期的 1024 维向量");
  }

  const rerankingProvider = getGroundedAnswerRerankingProvider();
  const rerankingResult = await rerankingProvider.rerank(
    "GroundedDesk 如何回答问题？",
    [
      {
        id: "grounded-answer",
        content: "GroundedDesk 只根据已维护的知识来源生成有据回答。",
      },
      {
        id: "unrelated",
        content: "这段内容只用于验证真实重排服务可以比较候选项。",
      },
    ],
  );

  if (
    rerankingResult.value.length !== 2 ||
    rerankingResult.value.some(({ score }) => !Number.isFinite(score))
  ) {
    throw new Error("重排服务未返回完整的有限分数");
  }

  const generationProvider = getGroundedAnswerGenerationProvider();
  const generation = generationProvider.streamAnswer({
    question: "GroundedDesk 如何回答问题？",
    assistant: {
      name: "GroundedDesk 冒烟助手",
      serviceScope: "验证真实 AI 供应商连接，不处理真实业务数据。",
      tone: "concise",
    },
    evidence: [
      {
        contentUnitId: "live-smoke-unit",
        exactExcerpt:
          "GroundedDesk 只根据已维护的知识来源生成有据回答。",
      },
    ],
  });
  let generatedCharacters = 0;

  for await (const delta of generation.textStream) {
    generatedCharacters += Array.from(delta).length;
  }

  const generationMetadata = await generation.metadata;

  if (generatedCharacters === 0) {
    throw new Error("回答生成服务返回了空正文");
  }

  process.stdout.write(
    [
      "GroundedDesk 真实 AI 冒烟通过",
      `向量：${embeddingProvider.provider}/${embeddingProvider.model}，${embedding.length} 维`,
      `重排：${rerankingProvider.provider}/${rerankingProvider.model}，${rerankingResult.value.length} 个候选`,
      `生成：${generationProvider.provider}/${generationProvider.model}，${generatedCharacters} 个字符`,
      `用量：向量 ${embeddingResult.tokens.total}，重排 ${rerankingResult.tokens.total}，生成 ${generationMetadata.tokens.total} tokens`,
    ].join("\n") + "\n",
  );
}

function assertLiveProviderConfiguration() {
  if (
    process.env.DETERMINISTIC_AI === "true" ||
    process.env.DETERMINISTIC_EMBEDDINGS === "true"
  ) {
    throw new Error("真实 AI 冒烟不能启用确定性供应商");
  }

  const missingVariables = [
    "DEEPSEEK_API_KEY",
    "SILICONFLOW_API_KEY",
  ].filter((name) => !process.env[name]);

  if (missingVariables.length > 0) {
    throw new Error(`缺少服务端环境变量 ${missingVariables.join("、")}`);
  }
}
