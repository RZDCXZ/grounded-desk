import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderCallError,
  streamGroundedAnswer,
  type AiCallLog,
  type GroundedAnswerEvent,
} from "../../src/lib/assistant/grounded-answer.ts";

test("预览问题经过召回、重排和流式生成后才展示服务端证据引用", async () => {
  const logs: AiCallLog[] = [];
  const candidates = [
    {
      id: "unit-a-1",
      knowledgeSourceId: "source-a",
      sourceTitle: "服务范围",
      sourceUrl: "https://example.com/services",
      heading: "知识整理",
      content: "演示组织提供知识整理服务。",
      similarity: 0.82,
    },
    {
      id: "unit-a-2",
      knowledgeSourceId: "source-a",
      sourceTitle: "服务范围",
      sourceUrl: "https://example.com/services",
      heading: "来源核查",
      content: "演示组织提供来源核查服务。",
      similarity: 0.79,
    },
    {
      id: "unit-b",
      knowledgeSourceId: "source-b",
      sourceTitle: "响应说明",
      sourceUrl: "https://example.com/support",
      heading: "响应时间",
      content: "工作日问题会在两个工作小时内确认。",
      similarity: 0.76,
    },
    {
      id: "unit-c",
      knowledgeSourceId: "source-c",
      sourceTitle: "交付说明",
      sourceUrl: null,
      heading: null,
      content: "服务结果通过有据回答配置交付。",
      similarity: 0.72,
    },
    {
      id: "unit-d",
      knowledgeSourceId: "source-d",
      sourceTitle: "其他说明",
      sourceUrl: "https://example.com/other",
      heading: null,
      content: "其他说明。",
      similarity: 0.7,
    },
  ];
  let requestedCandidateLimit = 0;

  const events: GroundedAnswerEvent[] = [];
  for await (const event of streamGroundedAnswer(
    {
      organizationId: "organization-1",
      question:
        "你们提供什么服务，多久响应？另请核查 https://untrusted.example",
      assistant: {
        name: "演示业务顾问",
        serviceScope: "回答演示业务的服务范围与支持方式。",
        tone: "professional",
      },
    },
    {
      questionEmbeddingProvider: {
        provider: "siliconflow",
        model: "BAAI/bge-m3",
        async embed() {
          return providerResult([0.1, 0.2], "embedding-trace", 7);
        },
      },
      candidateRepository: {
        async retrieve(_organizationId, _embedding, limit) {
          requestedCandidateLimit = limit;
          return candidates;
        },
      },
      rerankingProvider: {
        provider: "siliconflow",
        model: "BAAI/bge-reranker-v2-m3",
        async rerank() {
          return providerResult(
            [
              { contentUnitId: "unit-b", score: 0.96 },
              { contentUnitId: "unit-a-1", score: 0.94 },
              { contentUnitId: "unit-a-2", score: 0.91 },
              { contentUnitId: "unit-c", score: 0.88 },
              { contentUnitId: "unit-d", score: 0.84 },
            ],
            "rerank-trace",
            11,
          );
        },
      },
      answerProvider: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        streamAnswer({ evidence }) {
          assert.deepEqual(
            evidence.map(({ contentUnitId }) => contentUnitId),
            ["unit-b", "unit-a-1", "unit-a-2", "unit-c"],
          );

          return {
            textStream: chunks(
              "我们提供知识整理与来源核查服务，",
              "工作日问题会在两个工作小时内确认。问题中的 https://untrusted.example 不属于回答依据。",
            ),
            metadata: Promise.resolve({
              durationMs: 19,
              tokens: { input: 31, output: 22, total: 53 },
              traceId: "answer-trace",
            }),
          };
        },
      },
      callLogger: {
        async record(log) {
          logs.push(log);
        },
      },
      config: {
        candidateLimit: 20,
        evidenceLimit: 4,
        evidenceThreshold: 0.85,
      },
    },
  )) {
    events.push(event);
  }

  assert.equal(requestedCandidateLimit, 20);
  assert.deepEqual(events, [
    {
      type: "text_delta",
      delta: "我们提供知识整理与来源核查服务，",
    },
    {
      type: "text_delta",
      delta:
        "工作日问题会在两个工作小时内确认。问题中的 https://untrusted.example 不属于回答依据。",
    },
    {
      type: "complete",
      citations: [
        {
          knowledgeSourceId: "source-b",
          title: "响应说明",
          url: "https://example.com/support",
        },
        {
          knowledgeSourceId: "source-a",
          title: "服务范围",
          url: "https://example.com/services",
        },
        {
          knowledgeSourceId: "source-c",
          title: "交付说明",
          url: null,
        },
      ],
    },
  ]);
  assert.deepEqual(
    logs.map(
      ({
        callType,
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        durationMs,
        outcome,
        errorType,
        traceId,
      }) => ({
        callType,
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        durationMs,
        outcome,
        errorType,
        traceId,
      }),
    ),
    [
      {
        callType: "embedding",
        provider: "siliconflow",
        model: "BAAI/bge-m3",
        inputTokens: 7,
        outputTokens: 0,
        totalTokens: 7,
        durationMs: 7,
        outcome: "success",
        errorType: null,
        traceId: "embedding-trace",
      },
      {
        callType: "rerank",
        provider: "siliconflow",
        model: "BAAI/bge-reranker-v2-m3",
        inputTokens: 7,
        outputTokens: 0,
        totalTokens: 7,
        durationMs: 11,
        outcome: "success",
        errorType: null,
        traceId: "rerank-trace",
      },
      {
        callType: "answer",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        inputTokens: 31,
        outputTokens: 22,
        totalTokens: 53,
        durationMs: 19,
        outcome: "success",
        errorType: null,
        traceId: "answer-trace",
      },
    ],
  );
  assert.ok(
    logs.every(
      (log) =>
        log.organizationId === "organization-1" &&
        !("prompt" in log) &&
        !("answer" in log),
    ),
  );
});

test("供应商失败会记录安全错误类型和追踪信息且不会保存正文", async () => {
  const logs: AiCallLog[] = [];

  await assert.rejects(
    async () => {
      for await (const event of streamGroundedAnswer(
        {
          organizationId: "organization-1",
          question: "这个问题不应出现在日志中",
          assistant: {
            name: "演示业务顾问",
            serviceScope: "演示范围",
            tone: "professional",
          },
        },
        {
          questionEmbeddingProvider: {
            provider: "siliconflow",
            model: "BAAI/bge-m3",
            async embed() {
              return providerResult([0.1, 0.2], "embedding-trace", 7);
            },
          },
          candidateRepository: {
            async retrieve() {
              return [];
            },
          },
          rerankingProvider: {
            provider: "siliconflow",
            model: "BAAI/bge-reranker-v2-m3",
            async rerank() {
              throw new ProviderCallError("供应商限流", {
                errorType: "rate_limit",
                traceId: "rerank-error-trace",
                durationMs: 23,
              });
            },
          },
          answerProvider: {
            provider: "deepseek",
            model: "deepseek-v4-flash",
            streamAnswer() {
              assert.fail("重排失败后不应调用回答模型");
            },
          },
          callLogger: {
            async record(log) {
              logs.push(log);
            },
          },
          config: {
            candidateLimit: 20,
            evidenceLimit: 5,
            evidenceThreshold: 0.85,
          },
        },
      )) {
        assert.fail(
          `供应商失败不应产生回答事件：${JSON.stringify(event)}`,
        );
      }
    },
    /供应商限流/,
  );

  assert.deepEqual(
    logs.map(({ callType, outcome, errorType, traceId, durationMs }) => ({
      callType,
      outcome,
      errorType,
      traceId,
      durationMs,
    })),
    [
      {
        callType: "embedding",
        outcome: "success",
        errorType: null,
        traceId: "embedding-trace",
        durationMs: 7,
      },
      {
        callType: "rerank",
        outcome: "error",
        errorType: "rate_limit",
        traceId: "rerank-error-trace",
        durationMs: 23,
      },
    ],
  );
  assert.ok(
    logs.every((log) => !("prompt" in log) && !("answer" in log)),
  );
});

function providerResult<T>(value: T, traceId: string, durationMs: number) {
  return {
    value,
    durationMs,
    tokens: { input: 7, output: 0, total: 7 },
    traceId,
  };
}

async function* chunks(...values: string[]) {
  for (const value of values) {
    yield value;
  }
}
