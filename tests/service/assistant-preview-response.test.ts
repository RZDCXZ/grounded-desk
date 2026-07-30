import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderCallError,
  streamGroundedAnswer,
} from "../../src/lib/assistant/grounded-answer.ts";
import {
  streamAnalyzedAssistantResponse,
} from "../../src/lib/assistant/request-analysis.ts";
import { createAssistantPreviewResponse } from "../../src/lib/assistant/preview-response.ts";
import { streamSingleSectionResponse } from "../../src/lib/assistant/response-sections.ts";

test("预览 HTTP 流对高置信交流输入使用受控回应且不调用知识回答", async () => {
  let knowledgeCalls = 0;
  const question = "Hello!";
  const response = createAssistantPreviewResponse(
    streamSingleSectionResponse(
      streamAnalyzedAssistantResponse(
        {
          organizationId: "organization-1",
          question,
          assistant: {
            name: "Demo Advisor",
            serviceScope: "account services",
            tone: "professional",
          },
        },
        {
          async analyzeRequest() {
            return {
              version: "request-analysis-v1",
              language: "en",
              interactionType: "conversational",
              conversationalIntent: "greeting",
              factualRequests: [],
            };
          },
          streamKnowledgeResponse() {
            knowledgeCalls += 1;
            return (async function* () {
              yield {
                type: "refusal" as const,
                resultType: "grounded_refusal" as const,
                message: "This knowledge path must not run.",
                contact: {
                  label: "Contact us",
                  url: "https://example.com/contact",
                },
              };
            })();
          },
        },
      ),
      "00000000-0000-4000-8000-000000001801",
    ),
    {
      label: "Contact us",
      url: "https://example.com/contact",
    },
    "en",
  );

  assert.equal(knowledgeCalls, 0);
  assert.deepEqual(await readNdjson(response), [
    {
      type: "section_start",
      section: {
        id: "00000000-0000-4000-8000-000000001801",
        order: 1,
        status: "streaming",
      },
    },
    {
      type: "section_delta",
      sectionId: "00000000-0000-4000-8000-000000001801",
      delta:
        "Hello, I'm Demo Advisor. You can ask me about account services.",
    },
    {
      type: "section_complete",
      section: {
        id: "00000000-0000-4000-8000-000000001801",
        order: 1,
        status: "conversational",
        content:
          "Hello, I'm Demo Advisor. You can ask me about account services.",
        citations: [],
      },
    },
    {
      type: "message_complete",
      resultType: "conversational_response",
      sections: [
        {
          id: "00000000-0000-4000-8000-000000001801",
          order: 1,
          status: "conversational",
          content:
            "Hello, I'm Demo Advisor. You can ask me about account services.",
          citations: [],
        },
      ],
    },
  ]);
  assert.equal(knowledgeCalls, 0);
});

test("预览 HTTP 流由请求分析缺失信息展示普通澄清提问", async () => {
  const question = "退款";
  const assistant = {
    name: "演示业务顾问",
    serviceScope: "演示业务范围",
    tone: "professional",
    humanContactLabel: "联系业务团队",
    humanContactUrl: "https://example.com/contact",
  };
  const providerCalls: string[] = [];
  const response = createAssistantPreviewResponse(
    streamSingleSectionResponse(
      streamAnalyzedAssistantResponse(
        {
          organizationId: "organization-1",
          question,
          assistant,
        },
        {
          async analyzeRequest() {
            return {
              version: "request-analysis-v1",
              language: "zh",
              interactionType: "incomplete",
              conversationalIntent: null,
              factualRequests: [
                {
                  id: "00000000-0000-4000-8000-000000001803",
                  order: 1,
                  originalText: "退款",
                  normalizedQuestion: "退款",
                  completeness: "incomplete",
                  missingInformation: ["想了解退款的具体方面"],
                },
              ],
            };
          },
          streamKnowledgeResponse() {
            return streamGroundedAnswer(
              {
                organizationId: "organization-1",
                question,
                assistant,
              },
              {
                questionEmbeddingProvider: {
                  provider: "test",
                  model: "embedding",
                  async embed() {
                    providerCalls.push("embedding");
                    return previewProviderResult(
                      [0.1, 0.2],
                      "embedding-trace",
                    );
                  },
                },
                candidateRepository: {
                  async retrieve() {
                    return [];
                  },
                },
                rerankingProvider: {
                  provider: "test",
                  model: "rerank",
                  async rerank() {
                    assert.fail("无候选证据时不应重排");
                  },
                },
                answerProvider: {
                  provider: "test",
                  model: "answer",
                  streamAnswer() {
                    assert.fail("澄清提问不应调用回答模型");
                  },
                },
                callLogger: {
                  async record() {},
                },
                config: {
                  candidateLimit: 20,
                  evidenceLimit: 5,
                  evidenceThreshold: 0.85,
                },
              },
            );
          },
        },
      ),
      "00000000-0000-4000-8000-000000001802",
    ),
    {
      label: assistant.humanContactLabel,
      url: assistant.humanContactUrl,
    },
  );

  assert.deepEqual(await readNdjson(response), [
    {
      type: "section_start",
      section: {
        id: "00000000-0000-4000-8000-000000001802",
        order: 1,
        status: "streaming",
      },
    },
    {
      type: "section_delta",
      sectionId: "00000000-0000-4000-8000-000000001802",
      delta: "请补充：想了解退款的具体方面。",
    },
    {
      type: "section_complete",
      section: {
        id: "00000000-0000-4000-8000-000000001802",
        order: 1,
        status: "clarification",
        content: "请补充：想了解退款的具体方面。",
        citations: [],
      },
    },
    {
      type: "message_complete",
      resultType: "clarification_request",
      sections: [
        {
          id: "00000000-0000-4000-8000-000000001802",
          order: 1,
          status: "clarification",
          content: "请补充：想了解退款的具体方面。",
          citations: [],
        },
      ],
    },
  ]);
  assert.deepEqual(providerCalls, []);
});

test("预览 HTTP 流将供应商超时映射为可重试技术故障而非可靠拒答", async () => {
  const response = createAssistantPreviewResponse(
    (async function* () {
      throw new ProviderCallError("回答生成超时", {
        errorType: "timeout",
        traceId: "answer-timeout",
        durationMs: 20_000,
      });
    })(),
    {
      label: "联系业务团队",
      url: "https://example.com/contact",
    },
  );

  assert.equal(
    response.headers.get("content-type"),
    "application/x-ndjson; charset=utf-8",
  );
  assert.deepEqual(await readNdjson(response), [
    {
      type: "temporary_failure",
      reason: "provider_failure",
      message: "供应商服务暂时不可用，请稍后重试。",
      retryable: true,
      contact: {
        label: "联系业务团队",
        url: "https://example.com/contact",
      },
    },
  ]);
});

for (const scenario of [
  {
    errorType: "rate_limit",
    reason: "rate_limited",
    message: "供应商请求频率受限，请稍后重试。",
  },
  {
    errorType: "input_rejected",
    reason: "input_rejected",
    message: "当前输入未被供应商接受，请调整问题后重试。",
  },
] as const) {
  test(`预览 HTTP 流明确标识${scenario.reason}`, async () => {
    const response = createAssistantPreviewResponse(
      (async function* () {
        throw new ProviderCallError("供应商拒绝请求", {
          errorType: scenario.errorType,
          traceId: `${scenario.errorType}-trace`,
          durationMs: 10,
        });
      })(),
      {
        label: "联系业务团队",
        url: "https://example.com/contact",
      },
    );

    assert.deepEqual(await readNdjson(response), [
      {
        type: "temporary_failure",
        reason: scenario.reason,
        message: scenario.message,
        retryable: true,
        contact: {
          label: "联系业务团队",
          url: "https://example.com/contact",
        },
      },
    ]);
  });
}

async function readNdjson(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

function previewProviderResult<T>(value: T, traceId: string) {
  return {
    value,
    durationMs: 1,
    tokens: { input: 1, output: 0, total: 1 },
    traceId,
  };
}
