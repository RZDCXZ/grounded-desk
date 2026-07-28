import "server-only";

import {
  ProviderCallError,
  createProviderRequestError as createEmbeddingCallError,
  elapsedMilliseconds,
  safeTokenCount,
  type ProviderCallResult,
} from "@/lib/ai/provider-call";
import type { EmbeddingProvider } from "@/lib/knowledge/process-revision";

const EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3";
const DEFAULT_TIMEOUT_MILLISECONDS = 20_000;

type SiliconFlowEmbeddingResponse = {
  data?: Array<{
    index?: number;
    embedding?: unknown;
  }>;
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

export function getKnowledgeEmbeddingProvider(): EmbeddingProvider {
  const provider = getKnowledgeEmbeddingProviderWithMetadata();

  return {
    async embed(texts) {
      return (await provider.embed(texts)).value;
    },
  };
}

export function getKnowledgeEmbeddingProviderWithMetadata() {
  const model =
    process.env.SILICONFLOW_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;

  return {
    provider: "siliconflow",
    model,
    async embed(
      texts: string[],
    ): Promise<ProviderCallResult<number[][]>> {
      const startedAt = performance.now();
      const fallbackTraceId = crypto.randomUUID();

      if (process.env.DETERMINISTIC_EMBEDDINGS === "true") {
        if (process.env.NODE_ENV === "production") {
          throw new ProviderCallError("生产环境禁止使用确定性向量提供器", {
            errorType: "configuration",
            traceId: fallbackTraceId,
            durationMs: elapsedMilliseconds(startedAt),
          });
        }

        const inputTokens = texts.reduce(
          (total, text) => total + Array.from(text).length,
          0,
        );

        return {
          value: texts.map(createDeterministicEmbedding),
          durationMs: elapsedMilliseconds(startedAt),
          tokens: {
            input: inputTokens,
            output: 0,
            total: inputTokens,
          },
          traceId: fallbackTraceId,
        };
      }

      const apiKey = process.env.SILICONFLOW_API_KEY;

      if (!apiKey) {
        throw new ProviderCallError(
          "缺少服务端环境变量 SILICONFLOW_API_KEY",
          {
            errorType: "configuration",
            traceId: fallbackTraceId,
            durationMs: elapsedMilliseconds(startedAt),
          },
        );
      }

      const baseUrl = (
        process.env.SILICONFLOW_BASE_URL ?? DEFAULT_SILICONFLOW_BASE_URL
      ).replace(/\/$/, "");
      const timeout = Number(
        process.env.SILICONFLOW_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MILLISECONDS,
      );
      let response: Response;

      try {
        response = await fetch(`${baseUrl}/embeddings`, {
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
      } catch (error) {
        throw createEmbeddingCallError(
          "向量服务请求失败",
          error,
          fallbackTraceId,
          startedAt,
        );
      }

      const traceId =
        response.headers.get("x-siliconcloud-trace-id") ?? fallbackTraceId;

      if (!response.ok) {
        throw new ProviderCallError(
          `向量服务返回 HTTP ${response.status}`,
          {
            errorType:
              response.status === 429 ? "rate_limit" : "provider_http",
            traceId,
            durationMs: elapsedMilliseconds(startedAt),
          },
        );
      }

      let payload: SiliconFlowEmbeddingResponse;

      try {
        payload = (await response.json()) as SiliconFlowEmbeddingResponse;
      } catch (error) {
        throw createEmbeddingCallError(
          "向量服务返回无效响应",
          error,
          traceId,
          startedAt,
          "invalid_response",
        );
      }

      const ordered = [...(payload.data ?? [])].sort(
        (left, right) => (left.index ?? 0) - (right.index ?? 0),
      );

      if (ordered.length !== texts.length) {
        throw new ProviderCallError("向量服务返回数量不一致", {
          errorType: "invalid_response",
          traceId,
          durationMs: elapsedMilliseconds(startedAt),
        });
      }

      const inputTokens = safeTokenCount(payload.usage?.prompt_tokens);
      const totalTokens = Math.max(
        inputTokens,
        safeTokenCount(payload.usage?.total_tokens),
      );

      try {
        return {
          value: ordered.map(({ embedding }) => validateEmbedding(embedding)),
          durationMs: elapsedMilliseconds(startedAt),
          tokens: {
            input: inputTokens,
            output: 0,
            total: totalTokens,
          },
          traceId,
        };
      } catch (error) {
        throw createEmbeddingCallError(
          "向量服务返回无效向量",
          error,
          traceId,
          startedAt,
          "invalid_response",
        );
      }
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
