import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublicConversationResponse,
  type PublicConversationOutcome,
  type PublicConversationStart,
} from "../../src/lib/assistant/public-conversation.ts";
import type { GroundedAnswerEvent } from "../../src/lib/assistant/grounded-answer.ts";

const publicId = "00000000-0000-4000-8000-000000000301";
const conversationId = "00000000-0000-4000-8000-000000000401";

test("公开消息接口只使用公开助手 ID 推导组织并返回流式有据回答", async () => {
  const started: Array<{ publicId: string; question: string }> = [];
  const answerInputs: PublicConversationStart[] = [];
  const outcomes: PublicConversationOutcome[] = [];
  const response = await createPublicConversationResponse(
    new Request("http://localhost/api/public/assistants/id/messages", {
      method: "POST",
      body: JSON.stringify({
        question: "  你们提供什么服务？  ",
        organizationId: "client-controlled-organization",
      }),
      headers: {
        "content-type": "application/json",
      },
    }),
    publicId,
    {
      async beginConversation(requestedPublicId, question) {
        started.push({ publicId: requestedPublicId, question });
        return publicConversationStart();
      },
      streamAnswer(start) {
        answerInputs.push(start);
        return answerEvents([
          { type: "text_delta", delta: "我们提供知识整理服务。" },
          {
            type: "complete",
            citations: [
              {
                knowledgeSourceId: "source-1",
                title: "服务说明",
                url: "https://example.com/services",
              },
            ],
          },
        ]);
      },
      async completeConversation(_start, outcome) {
        outcomes.push(outcome);
      },
      async failConversation() {
        assert.fail("成功回答不应记录为技术故障");
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/x-ndjson; charset=utf-8",
  );
  assert.equal(
    response.headers.get("x-assistant-message-id"),
    publicConversationStart().assistantMessageId,
  );
  assert.deepEqual(started, [
    { publicId, question: "你们提供什么服务？" },
  ]);
  assert.deepEqual(answerInputs, [
    {
      ...publicConversationStart(),
      question: "你们提供什么服务？",
    },
  ]);
  assert.deepEqual(await readNdjson(response), [
    { type: "text_delta", delta: "我们提供知识整理服务。" },
    {
      type: "complete",
      citations: [
        {
          knowledgeSourceId: "source-1",
          title: "服务说明",
          url: "https://example.com/services",
        },
      ],
    },
  ]);
  assert.deepEqual(outcomes, [
    {
      type: "grounded_answer",
      content: "我们提供知识整理服务。",
      citations: [
        {
          knowledgeSourceId: "source-1",
          title: "服务说明",
          url: "https://example.com/services",
        },
      ],
    },
  ]);
});

test("公开消息接口在同一会话中传递有限近期上下文并返回会话标识", async () => {
  const beginInputs: Array<{
    publicId: string;
    question: string;
    conversationId?: string;
  }> = [];
  const answerInputs: Array<
    PublicConversationStart & { question: string }
  > = [];
  const response = await createPublicConversationResponse(
    new Request("http://localhost/api/public/assistants/id/messages", {
      method: "POST",
      body: JSON.stringify({
        question: "它包含实施支持吗？",
        conversationId,
      }),
      headers: {
        "content-type": "application/json",
      },
    }),
    publicId,
    {
      async beginConversation(
        requestedPublicId,
        question,
        conversationId,
      ) {
        beginInputs.push({
          publicId: requestedPublicId,
          question,
          conversationId,
        });
        return {
          ...publicConversationStart(),
          context: [
            { role: "visitor", content: "你们提供什么服务？" },
            {
              role: "assistant",
              content: "我们提供知识整理服务。",
            },
          ],
        };
      },
      streamAnswer(start) {
        answerInputs.push(start);
        return answerEvents([
          { type: "text_delta", delta: "包含实施支持。" },
          { type: "complete", citations: [] },
        ]);
      },
      async completeConversation() {},
      async failConversation() {
        assert.fail("成功追问不应记录为技术故障");
      },
    },
  );

  assert.deepEqual(beginInputs, [
    {
      publicId,
      question: "它包含实施支持吗？",
      conversationId,
    },
  ]);
  assert.equal(response.headers.get("x-conversation-id"), conversationId);
  assert.deepEqual(answerInputs, [
    {
      ...publicConversationStart(),
      context: [
        { role: "visitor", content: "你们提供什么服务？" },
        {
          role: "assistant",
          content: "我们提供知识整理服务。",
        },
      ],
      question: "它包含实施支持吗？",
    },
  ]);
  await response.text();
});

test("公开消息接口把技术故障重试标记为重试而不是新问题", async () => {
  const beginInputs: Array<{
    conversationId?: string;
    retry?: boolean;
  }> = [];
  const response = await createPublicConversationResponse(
    new Request("http://localhost/api/public/assistants/id/messages", {
      method: "POST",
      body: JSON.stringify({
        question: "保留并重试这个问题",
        conversationId,
        retry: true,
      }),
      headers: {
        "content-type": "application/json",
      },
    }),
    publicId,
    {
      async beginConversation(
        _requestedPublicId,
        _question,
        requestedConversationId,
        retry,
      ) {
        beginInputs.push({
          conversationId: requestedConversationId,
          retry,
        });
        return publicConversationStart();
      },
      streamAnswer() {
        return answerEvents([
          { type: "text_delta", delta: "重试成功。" },
          { type: "complete", citations: [] },
        ]);
      },
      async completeConversation() {},
      async failConversation() {
        assert.fail("成功重试不应再次保存技术故障");
      },
    },
  );

  await response.text();
  assert.deepEqual(beginInputs, [{ conversationId, retry: true }]);
});

test("草稿、已下线或未知助手不能通过公开消息接口调用回答链路", async () => {
  let answerCalls = 0;
  const response = await createPublicConversationResponse(
    questionRequest("这个问题不应进入回答链路"),
    publicId,
    {
      async beginConversation() {
        return null;
      },
      streamAnswer() {
        answerCalls += 1;
        return answerEvents([]);
      },
      async completeConversation() {
        assert.fail("不可公开访问的助手不应保存回答");
      },
      async failConversation() {
        assert.fail("不可公开访问的助手不应保存故障消息");
      },
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    message: "该助手当前不可公开访问。",
  });
  assert.equal(answerCalls, 0);
});

for (const scenario of [
  {
    blockedReason: "answer_in_progress",
    status: 409,
    code: "answer_in_progress",
    message: "当前会话已有回答正在生成，请等待完成后再提问。",
  },
  {
    blockedReason: "rate_limited",
    status: 429,
    code: "rate_limited",
    message: "当前会话每分钟最多发送五条消息，请稍后再试。",
  },
  {
    blockedReason: "question_limit",
    status: 409,
    code: "question_limit",
    message: "当前会话已达到三十个问题的上限，请开始新会话。",
  },
  {
    blockedReason: "daily_budget",
    status: 503,
    code: "daily_budget",
    message: "今日 AI 咨询额度已用完，请通过人工联系入口继续咨询。",
  },
] as const) {
  test(`公开消息接口在模型调用前阻断 ${scenario.blockedReason}`, async () => {
    let answerCalls = 0;
    const response = await createPublicConversationResponse(
      questionRequest("这个问题不应调用模型"),
      publicId,
      {
        async beginConversation() {
          return {
            blockedReason: scenario.blockedReason,
            conversationId,
            contact: {
              label: "联系业务团队",
              url: "https://example.com/contact",
            },
          };
        },
        streamAnswer() {
          answerCalls += 1;
          return answerEvents([]);
        },
        async completeConversation() {
          assert.fail("受限请求不应保存回答");
        },
        async failConversation() {
          assert.fail("受限请求不应保存技术故障");
        },
      },
    );

    assert.equal(response.status, scenario.status);
    assert.deepEqual(await response.json(), {
      code: scenario.code,
      message: scenario.message,
      conversationId,
      canStartNewConversation:
        scenario.blockedReason === "question_limit",
      contact: {
        label: "联系业务团队",
        url: "https://example.com/contact",
      },
    });
    assert.equal(answerCalls, 0);
  });
}

test("公开消息接口拒绝空问题和超长问题且不会创建会话", async () => {
  for (const request of [
    questionRequest("   "),
    questionRequest("问".repeat(2_001)),
  ]) {
    let beginCalls = 0;
    const response = await createPublicConversationResponse(
      request,
      publicId,
      {
        async beginConversation() {
          beginCalls += 1;
          return publicConversationStart();
        },
        streamAnswer() {
          return answerEvents([]);
        },
        async completeConversation() {
          assert.fail("无效问题不应保存回答");
        },
        async failConversation() {
          assert.fail("无效问题不应保存故障消息");
        },
      },
    );

    assert.equal(response.status, 400);
    assert.equal(beginCalls, 0);
  }
});

test("可靠拒答与技术故障会写入对应的单轮会话历史", async () => {
  const outcomes: PublicConversationOutcome[] = [];
  let failures = 0;

  const refusalResponse = await createPublicConversationResponse(
    questionRequest("你们在上海有办公室吗？"),
    publicId,
    {
      async beginConversation() {
        return publicConversationStart();
      },
      streamAnswer() {
        return answerEvents([
          {
            type: "refusal",
            message: "当前可用知识不足以支持这个问题的事实性回答。",
            contact: {
              label: "联系业务团队",
              url: "https://example.com/contact",
            },
          },
        ]);
      },
      async completeConversation(_start, outcome) {
        outcomes.push(outcome);
      },
      async failConversation() {
        failures += 1;
      },
    },
  );

  await refusalResponse.text();

  const failureResponse = await createPublicConversationResponse(
    questionRequest("触发供应商故障"),
    publicId,
    {
      async beginConversation() {
        return publicConversationStart();
      },
      streamAnswer() {
        return (async function* () {
          throw new Error("provider unavailable");
        })();
      },
      async completeConversation(_start, outcome) {
        outcomes.push(outcome);
      },
      async failConversation() {
        failures += 1;
      },
    },
  );

  await failureResponse.text();

  assert.deepEqual(outcomes, [
    {
      type: "grounded_refusal",
      content: "当前可用知识不足以支持这个问题的事实性回答。",
      citations: [],
    },
  ]);
  assert.equal(failures, 1);
});

test("英文问题的技术故障使用英文且不会呈现为知识不足", async () => {
  const response = await createPublicConversationResponse(
    questionRequest("What services do you provide?"),
    publicId,
    {
      async beginConversation() {
        return publicConversationStart();
      },
      streamAnswer() {
        return (async function* () {
          throw new Error("provider unavailable");
        })();
      },
      async completeConversation() {
        assert.fail("技术故障不应保存为有据回答或可靠拒答");
      },
      async failConversation() {},
    },
  );

  assert.deepEqual(await readNdjson(response), [
    {
      type: "temporary_failure",
      reason: "provider_failure",
      message: "The provider service is temporarily unavailable. Please try again later.",
      retryable: true,
      contact: {
        label: "联系业务团队",
        url: "https://example.com/contact",
      },
    },
  ]);
});

function publicConversationStart(): PublicConversationStart {
  return {
    conversationId,
    assistantMessageId: "assistant-message-1",
    organizationId: "server-derived-organization",
    assistant: {
      name: "演示业务顾问",
      serviceScope: "演示业务范围",
      tone: "professional",
      humanContactLabel: "联系业务团队",
      humanContactUrl: "https://example.com/contact",
    },
  };
}

function questionRequest(question: string) {
  return new Request("http://localhost/api/public/assistants/id/messages", {
    method: "POST",
    body: JSON.stringify({ question }),
    headers: {
      "content-type": "application/json",
    },
  });
}

async function* answerEvents(events: GroundedAnswerEvent[]) {
  yield* events;
}

async function readNdjson(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}
