import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublicQualityFeedbackResponse,
  type QualityFeedbackValue,
} from "../../src/lib/assistant/quality-feedback.ts";

const publicId = "00000000-0000-4000-8000-000000000301";
const answerMessageId = "00000000-0000-4000-8000-000000000501";

test("公开反馈接口从路由标识提交质量反馈并忽略客户端组织字段", async () => {
  const submissions: Array<{
    publicId: string;
    answerMessageId: string;
    value: QualityFeedbackValue;
  }> = [];
  const response = await createPublicQualityFeedbackResponse(
    new Request("http://localhost/feedback", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        value: "unhelpful",
        organizationId: "client-controlled-organization",
        answerMessageId: "client-controlled-message",
      }),
    }),
    publicId,
    answerMessageId,
    {
      async submitFeedback(
        requestedPublicId,
        requestedAnswerMessageId,
        value,
      ) {
        submissions.push({
          publicId: requestedPublicId,
          answerMessageId: requestedAnswerMessageId,
          value,
        });
        return {
          feedbackId: "00000000-0000-4000-8000-000000000601",
          unresolvedQuestionId:
            "00000000-0000-4000-8000-000000000701",
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    feedbackValue: "unhelpful",
    unresolvedQuestionId: "00000000-0000-4000-8000-000000000701",
  });
  assert.deepEqual(submissions, [
    {
      publicId,
      answerMessageId,
      value: "unhelpful",
    },
  ]);
});

test("公开反馈接口拒绝未知反馈值且不执行持久化", async () => {
  let submitted = false;
  const response = await createPublicQualityFeedbackResponse(
    new Request("http://localhost/feedback", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "maybe" }),
    }),
    publicId,
    answerMessageId,
    {
      async submitFeedback() {
        submitted = true;
        return {
          feedbackId: "not-used",
          unresolvedQuestionId: null,
        };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: "请选择“有帮助”或“没帮助”。",
  });
  assert.equal(submitted, false);
});

test("公开反馈接口将不属于该助手的回答视为不存在", async () => {
  const response = await createPublicQualityFeedbackResponse(
    new Request("http://localhost/feedback", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "helpful" }),
    }),
    publicId,
    answerMessageId,
    {
      async submitFeedback() {
        return null;
      },
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    message: "这条助手回答不存在或尚未完成。",
  });
});
