import "server-only";

import type { EmbeddingProvider } from "@/lib/knowledge/process-manual";

const EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3";
const DEFAULT_TIMEOUT_MILLISECONDS = 20_000;

type SiliconFlowEmbeddingResponse = {
  data?: Array<{
    index?: number;
    embedding?: unknown;
  }>;
};

export function getKnowledgeEmbeddingProvider(): EmbeddingProvider {
  if (process.env.DETERMINISTIC_EMBEDDINGS === "true") {
    return {
      async embed(texts) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("生产环境禁止使用确定性向量提供器");
        }

        return texts.map(createDeterministicEmbedding);
      },
    };
  }

  return {
    async embed(texts) {
      const apiKey = process.env.SILICONFLOW_API_KEY;

      if (!apiKey) {
        throw new Error("缺少服务端环境变量 SILICONFLOW_API_KEY");
      }

      const baseUrl = (
        process.env.SILICONFLOW_BASE_URL ?? DEFAULT_SILICONFLOW_BASE_URL
      ).replace(/\/$/, "");
      const model =
        process.env.SILICONFLOW_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
      const timeout = Number(
        process.env.SILICONFLOW_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MILLISECONDS,
      );
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: texts,
          encoding_format: "float",
        }),
        signal: AbortSignal.timeout(
          Number.isFinite(timeout) ? timeout : DEFAULT_TIMEOUT_MILLISECONDS,
        ),
      });

      if (!response.ok) {
        throw new Error(`向量服务返回 HTTP ${response.status}`);
      }

      const payload = (await response.json()) as SiliconFlowEmbeddingResponse;
      const ordered = [...(payload.data ?? [])].sort(
        (left, right) => (left.index ?? 0) - (right.index ?? 0),
      );

      if (ordered.length !== texts.length) {
        throw new Error("向量服务返回数量不一致");
      }

      return ordered.map(({ embedding }) => validateEmbedding(embedding));
    },
  };
}

function validateEmbedding(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length !== EMBEDDING_DIMENSIONS ||
    value.some((item) => typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new Error("向量服务返回无效向量");
  }

  return value as number[];
}

function createDeterministicEmbedding(text: string) {
  const embedding = Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  Array.from(text).forEach((character, index) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const bucket = (codePoint * 31 + index * 17) % EMBEDDING_DIMENSIONS;
    embedding[bucket] += ((codePoint % 97) + 1) / 97;
  });

  const magnitude =
    Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0)) || 1;

  return embedding.map((value) => value / magnitude);
}
