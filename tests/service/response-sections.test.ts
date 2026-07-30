import assert from "node:assert/strict";
import test from "node:test";

import {
  reduceAssistantResponsePresentation,
  streamSingleSectionResponse,
} from "../../src/lib/assistant/response-sections.ts";

test("单项有据回答通过稳定身份的分段事件流返回", async () => {
  const citations = [
    {
      knowledgeSourceId: "00000000-0000-4000-8000-000000000701",
      title: "服务说明",
      url: "https://example.com/services",
    },
  ];
  const events = await collectEvents(
    streamSingleSectionResponse(
      (async function* () {
        yield {
          type: "text_delta" as const,
          delta: "我们提供",
        };
        yield {
          type: "text_delta" as const,
          delta: "知识整理服务。",
        };
        yield {
          type: "complete" as const,
          resultType: "grounded_answer" as const,
          citations,
        };
      })(),
      "00000000-0000-4000-8000-000000001701",
    ),
  );

  const completedSection = {
    id: "00000000-0000-4000-8000-000000001701",
    order: 1,
    status: "supported",
    content: "我们提供知识整理服务。",
    citations,
  };

  assert.deepEqual(events, [
    {
      type: "section_start",
      section: {
        id: completedSection.id,
        order: 1,
        status: "streaming",
      },
    },
    {
      type: "section_delta",
      sectionId: completedSection.id,
      delta: "我们提供",
    },
    {
      type: "section_delta",
      sectionId: completedSection.id,
      delta: "知识整理服务。",
    },
    {
      type: "section_complete",
      section: completedSection,
    },
    {
      type: "message_complete",
      resultType: "grounded_answer",
      sections: [completedSection],
    },
  ]);
});

test("可靠拒答通过同一分段完成契约返回受控内容和人工入口", async () => {
  const sectionId = "00000000-0000-4000-8000-000000001702";
  const contact = {
    label: "联系业务团队",
    url: "https://example.com/contact",
  };
  const events = await collectEvents(
    streamSingleSectionResponse(
      (async function* () {
        yield {
          type: "refusal" as const,
          resultType: "grounded_refusal" as const,
          message: "当前可用知识不足以支持这个问题的事实性回答。",
          contact,
        };
      })(),
      sectionId,
    ),
  );
  const completedSection = {
    id: sectionId,
    order: 1,
    status: "unsupported",
    content: "当前可用知识不足以支持这个问题的事实性回答。",
    citations: [],
    contact,
  };

  assert.deepEqual(events, [
    {
      type: "section_start",
      section: {
        id: sectionId,
        order: 1,
        status: "streaming",
      },
    },
    {
      type: "section_complete",
      section: completedSection,
    },
    {
      type: "message_complete",
      resultType: "grounded_refusal",
      sections: [completedSection],
    },
  ]);
});

test("两轮后人工接续使用独立结果和信息入口且不伪装为拒答", async () => {
  const sectionId = "00000000-0000-4000-8000-000000001705";
  const contact = {
    label: "联系人工团队",
    url: "https://example.com/support",
  };
  const events = await collectEvents(
    streamSingleSectionResponse(
      (async function* () {
        yield {
          type: "text_delta" as const,
          delta: "目前仍缺少：具体交易日期。请联系人工团队协助。",
        };
        yield {
          type: "complete" as const,
          resultType: "human_handoff" as const,
          citations: [],
          contact,
        };
      })(),
      sectionId,
    ),
  );

  assert.deepEqual(events.at(-2), {
    type: "section_complete",
    section: {
      id: sectionId,
      order: 1,
      status: "handoff",
      content: "目前仍缺少：具体交易日期。请联系人工团队协助。",
      citations: [],
      contact,
    },
  });
  assert.deepEqual(events.at(-1), {
    type: "message_complete",
    resultType: "human_handoff",
    sections: [
      {
        id: sectionId,
        order: 1,
        status: "handoff",
        content: "目前仍缺少：具体交易日期。请联系人工团队协助。",
        citations: [],
        contact,
      },
    ],
  });
});

test("公开端和预览端可通过同一归并器消费分段回答", () => {
  const streaming = reduceAssistantResponsePresentation(
    {
      answer: "我们提供",
      citations: [],
    },
    {
      type: "section_delta",
      sectionId: "00000000-0000-4000-8000-000000001703",
      delta: "知识整理服务。",
    },
  );

  assert.deepEqual(streaming, {
    status: "streaming",
    answer: "我们提供知识整理服务。",
    citations: [],
  });

  const completed = reduceAssistantResponsePresentation(
    streaming!,
    {
      type: "message_complete",
      resultType: "grounded_answer",
      sections: [],
    },
  );

  assert.deepEqual(completed, {
    status: "complete",
    resultType: "grounded_answer",
    answer: "我们提供知识整理服务。",
    citations: [],
  });
});

test("共享归并器将拒答分段转换为受控拒答展示状态", () => {
  const contact = {
    label: "联系业务团队",
    url: "https://example.com/contact",
  };

  assert.deepEqual(
    reduceAssistantResponsePresentation(
      {
        answer: "",
        citations: [],
      },
      {
        type: "section_complete",
        section: {
          id: "00000000-0000-4000-8000-000000001704",
          order: 1,
          status: "unsupported",
          content: "当前可用知识不足以支持这个问题的事实性回答。",
          citations: [],
          contact,
        },
      },
    ),
    {
      status: "refusal",
      answer: "",
      citations: [],
      message: "当前可用知识不足以支持这个问题的事实性回答。",
      contact,
    },
  );
});

async function collectEvents<T>(events: AsyncIterable<T>) {
  const collected: T[] = [];

  for await (const event of events) {
    collected.push(event);
  }

  return collected;
}
