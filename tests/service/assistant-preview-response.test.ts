import assert from "node:assert/strict";
import test from "node:test";

import { ProviderCallError } from "../../src/lib/assistant/grounded-answer.ts";
import {
  routeConversationInput,
  streamRoutedAssistantResponse,
} from "../../src/lib/assistant/conversational-response.ts";
import { createAssistantPreviewResponse } from "../../src/lib/assistant/preview-response.ts";

test("预览 HTTP 流对高置信交流输入使用受控回应且不调用知识回答", async () => {
  let knowledgeCalls = 0;
  const question = "Hello!";
  const response = createAssistantPreviewResponse(
    streamRoutedAssistantResponse({
      question,
      route: routeConversationInput(question),
      assistant: {
        name: "Demo Advisor",
        serviceScope: "account services",
        tone: "professional",
      },
      streamKnowledgeAnswer: () => {
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
    }),
    {
      label: "Contact us",
      url: "https://example.com/contact",
    },
    "en",
  );

  assert.equal(knowledgeCalls, 0);
  assert.deepEqual(await readNdjson(response), [
    {
      type: "text_delta",
      delta:
        "Hello, I'm Demo Advisor. You can ask me about account services.",
    },
    {
      type: "complete",
      resultType: "conversational_response",
      citations: [],
    },
  ]);
  assert.equal(knowledgeCalls, 0);
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
