import assert from "node:assert/strict";
import test from "node:test";

import { getKnowledgeEmbeddingProviderWithMetadata } from "../../src/lib/ai/embeddings.ts";
import {
  getGroundedAnswerGenerationProvider,
  getGroundedAnswerRerankingProvider,
} from "../../src/lib/ai/grounded-answer-providers.ts";
import { ProviderCallError } from "../../src/lib/ai/provider-call.ts";

test("向量适配器将请求超时归类为 timeout", async () => {
  await withProviderEnvironment(async () => {
    globalThis.fetch = async () => {
      throw new DOMException("timed out", "TimeoutError");
    };

    await assert.rejects(
      () => getKnowledgeEmbeddingProviderWithMetadata().embed(["演示问题"]),
      (error) =>
        error instanceof ProviderCallError && error.errorType === "timeout",
    );
  });
});

test("重排适配器将无效 HTTP 响应归类为 invalid_response", async () => {
  await withProviderEnvironment(async () => {
    globalThis.fetch = async () =>
      Response.json({
        results: [{ index: 0 }],
      });

    await assert.rejects(
      () =>
        getGroundedAnswerRerankingProvider().rerank("演示问题", [
          { id: "unit-a", content: "演示内容" },
        ]),
      (error) =>
        error instanceof ProviderCallError &&
        error.errorType === "invalid_response",
    );
  });
});

test("回答适配器将 HTTP 429 归类为 rate_limit", async () => {
  await withProviderEnvironment(async () => {
    globalThis.fetch = async () =>
      Response.json(
        { error: { message: "rate limited", type: "rate_limit" } },
        { status: 429 },
      );
    const answer = getGroundedAnswerGenerationProvider().streamAnswer({
      question: "你们提供什么服务？",
      assistant: {
        name: "演示业务顾问",
        serviceScope: "演示服务范围",
        tone: "professional",
      },
      evidence: [
        {
          id: "unit-a",
          contentUnitId: "unit-a",
          knowledgeSourceId: "source-a",
          sourceTitle: "服务范围",
          sourceUrl: "https://example.com/services",
          heading: "知识整理",
          content: "演示组织提供知识整理服务。",
          similarity: 0.8,
          rerankScore: 0.9,
        },
      ],
    });

    await assert.rejects(
      async () => {
        for await (const delta of answer.textStream) {
          assert.fail(`HTTP 429 不应生成回答正文：${delta}`);
        }
      },
      (error) =>
        error instanceof ProviderCallError &&
        error.errorType === "rate_limit",
    );
  });
});

async function withProviderEnvironment(operation: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalValues = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DETERMINISTIC_AI: process.env.DETERMINISTIC_AI,
    DETERMINISTIC_EMBEDDINGS: process.env.DETERMINISTIC_EMBEDDINGS,
    SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY,
  };

  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  process.env.SILICONFLOW_API_KEY = "test-siliconflow-key";
  delete process.env.DETERMINISTIC_AI;
  delete process.env.DETERMINISTIC_EMBEDDINGS;
  console.error = () => {};

  try {
    await operation();
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    restoreEnvironmentValue("DEEPSEEK_API_KEY", originalValues.DEEPSEEK_API_KEY);
    restoreEnvironmentValue(
      "SILICONFLOW_API_KEY",
      originalValues.SILICONFLOW_API_KEY,
    );
    restoreEnvironmentValue(
      "DETERMINISTIC_AI",
      originalValues.DETERMINISTIC_AI,
    );
    restoreEnvironmentValue(
      "DETERMINISTIC_EMBEDDINGS",
      originalValues.DETERMINISTIC_EMBEDDINGS,
    );
  }
}

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
