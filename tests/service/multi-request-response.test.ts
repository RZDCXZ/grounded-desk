import assert from "node:assert/strict";
import test from "node:test";

import type {
  AssistantResponseEvent,
} from "../../src/lib/assistant/grounded-answer.ts";
import {
  streamMultiRequestResponse,
} from "../../src/lib/assistant/multi-request-response.ts";
import type {
  RequestAnalysis,
} from "../../src/lib/assistant/request-analysis.ts";
import {
  responseDecisionAuditSymbol,
  type ResponseDecisionAudit,
} from "../../src/lib/assistant/response-decision-audit.ts";

test("三项完整事实诉求分别处理并按原始顺序形成有据回答", async () => {
  const calls: string[] = [];
  const events = await collectEvents(
    streamMultiRequestResponse(
      analysis([
        completeRequest("request-1", 1, "退款多久到账？"),
        completeRequest("request-2", 2, "可以开发票吗？"),
        completeRequest("request-3", 3, "支持哪些语言？"),
      ]),
      {
        assistant: assistant(),
        streamCompleteRequest(request) {
          calls.push(request.id);
          return supportedEvents(request);
        },
      },
    ),
  );

  assert.deepEqual(calls, ["request-1", "request-2", "request-3"]);
  assert.deepEqual(
    events
      .flatMap((event) =>
        event.type === "section_start"
          ? [[event.section.id, event.section.order]]
          : []
      ),
    [
      ["request-1", 1],
      ["request-2", 2],
      ["request-3", 3],
    ],
  );
  assert.deepEqual(events.at(-1), {
    type: "message_complete",
    resultType: "grounded_answer",
    sections: [
      supportedSection("request-1", 1, "退款多久到账？"),
      supportedSection("request-2", 2, "可以开发票吗？"),
      supportedSection("request-3", 3, "支持哪些语言？"),
    ],
  });
});

test("支持、无支持与冲突逐项保留并映射为部分有据回答", async () => {
  const events = await collectEvents(
    streamMultiRequestResponse(
      analysis([
        completeRequest("request-1", 1, "退款多久到账？"),
        completeRequest("request-2", 2, "可以开发票吗？"),
        completeRequest("request-3", 3, "支持哪些语言？"),
      ]),
      {
        assistant: assistant(),
        streamCompleteRequest(request) {
          if (request.id === "request-1") {
            return supportedEvents(request);
          }
          if (request.id === "request-2") {
            return refusalEvents(request);
          }
          return conflictEvents(request);
        },
      },
    ),
  );

  assert.deepEqual(
    events
      .flatMap((event) =>
        event.type === "section_complete"
          ? [{
              id: event.section.id,
              status: event.section.status,
              citations: event.section.citations.length,
            }]
          : []
      ),
    [
      { id: "request-1", status: "supported", citations: 1 },
      { id: "request-2", status: "unsupported", citations: 0 },
      { id: "request-3", status: "conflicting", citations: 2 },
    ],
  );
  const completion = events.at(-1);
  assert.equal(
    completion?.type === "message_complete"
      ? completion.resultType
      : null,
    "partially_grounded_answer",
  );
});

test("已有支持时不完整诉求使用受控澄清或人工接续段落", async () => {
  const knowledgeCalls: string[] = [];
  const events = await collectEvents(
    streamMultiRequestResponse(
      analysis([
        completeRequest("request-1", 1, "退款多久到账？"),
        {
          id: "request-2",
          order: 2,
          originalText: "发票",
          normalizedQuestion: "发票",
          completeness: "incomplete",
          missingInformation: ["发票类型"],
          clarificationRound: 1,
          requiresHumanHandoff: false,
        },
        {
          id: "request-3",
          order: 3,
          originalText: "账户",
          normalizedQuestion: "账户",
          completeness: "incomplete",
          missingInformation: ["所属组织"],
          clarificationRound: 2,
          requiresHumanHandoff: true,
        },
      ]),
      {
        assistant: assistant(),
        streamCompleteRequest(request) {
          knowledgeCalls.push(request.id);
          return supportedEvents(request);
        },
      },
    ),
  );

  assert.deepEqual(knowledgeCalls, ["request-1"]);
  assert.deepEqual(
    events
      .flatMap((event) =>
        event.type === "section_complete"
          ? [{
              id: event.section.id,
              status: event.section.status,
              content: event.section.content,
              contact: event.section.contact,
            }]
          : []
      ),
    [
      {
        id: "request-1",
        status: "supported",
        content: "退款多久到账？：有据回答。",
        contact: undefined,
      },
      {
        id: "request-2",
        status: "clarification",
        content: "请补充：发票类型。",
        contact: undefined,
      },
      {
        id: "request-3",
        status: "handoff",
        content: "目前仍缺少：所属组织。请联系人工团队协助。",
        contact: {
          label: "联系业务团队",
          url: "https://example.com/contact",
        },
      },
    ],
  );
  const completion = events.at(-1);
  assert.equal(
    completion?.type === "message_complete"
      ? completion.resultType
      : null,
    "partially_grounded_answer",
  );
  assert.deepEqual(
    completion?.type === "message_complete"
      ? completion.clarificationStates
      : undefined,
    [
      {
        originalText: "发票",
        round: 1,
        latestClarification: "请补充：发票类型。",
      },
    ],
  );
});

function analysis(
  factualRequests: RequestAnalysis["factualRequests"],
): RequestAnalysis {
  return {
    version: "request-analysis-v1",
    language: "zh",
    interactionType: "factual",
    conversationalIntent: null,
    factualRequests,
  };
}

function completeRequest(id: string, order: number, text: string) {
  return {
    id,
    order,
    originalText: text,
    normalizedQuestion: text,
    completeness: "complete" as const,
    missingInformation: [],
    clarificationRound: 0 as const,
    requiresHumanHandoff: false,
  };
}

function assistant() {
  return {
    humanContactLabel: "联系业务团队",
    humanContactUrl: "https://example.com/contact",
  };
}

function supportedSection(id: string, order: number, question: string) {
  return {
    id,
    order,
    title: question,
    status: "supported",
    content: `${question}：有据回答。`,
    citations: [
      {
        knowledgeSourceId: `source-${id}`,
        title: `${question}说明`,
        url: `https://example.com/${id}`,
      },
    ],
  };
}

async function* supportedEvents(
  request: RequestAnalysis["factualRequests"][number],
): AsyncGenerator<AssistantResponseEvent> {
  yield {
    type: "text_delta",
    delta: `${request.normalizedQuestion}：有据回答。`,
  };
  yield attachAudit(
    {
      type: "complete",
      resultType: "grounded_answer",
      citations: supportedSection(
        request.id,
        request.order,
        request.originalText,
      ).citations,
    },
    request,
    "supported",
  );
}

async function* refusalEvents(
  request: RequestAnalysis["factualRequests"][number],
): AsyncGenerator<AssistantResponseEvent> {
  yield attachAudit(
    {
      type: "refusal",
      resultType: "grounded_refusal",
      message: "当前可用知识不足以支持这个问题的事实性回答。",
      contact: {
        label: "联系业务团队",
        url: "https://example.com/contact",
      },
    },
    request,
    "unsupported",
  );
}

async function* conflictEvents(
  request: RequestAnalysis["factualRequests"][number],
): AsyncGenerator<AssistantResponseEvent> {
  yield {
    type: "text_delta",
    delta: "现有知识存在无法同时成立的信息。",
  };
  yield attachAudit(
    {
      type: "complete",
      resultType: "knowledge_conflict",
      citations: [
        {
          knowledgeSourceId: "source-a",
          contentUnitId: "unit-a",
          title: "来源 A",
          url: null,
          exactExcerpt: "仅支持中文。",
        },
        {
          knowledgeSourceId: "source-b",
          contentUnitId: "unit-b",
          title: "来源 B",
          url: null,
          exactExcerpt: "支持多语言。",
        },
      ],
    },
    request,
    "conflicting",
  );
}

function attachAudit<T extends AssistantResponseEvent>(
  event: T,
  request: RequestAnalysis["factualRequests"][number],
  status: "supported" | "unsupported" | "conflicting",
) {
  const audit: ResponseDecisionAudit = {
    factualRequest: {
      id: request.id,
      originalText: request.originalText,
      normalizedQuestion: request.normalizedQuestion,
      requestAnalysisVersion: "request-analysis-v1",
    },
    coverage: {
      version: "evidence-coverage-v1",
      factualRequestId: request.id,
      status,
      evidence: [],
    },
  };
  Object.defineProperty(event, responseDecisionAuditSymbol, {
    value: audit,
    enumerable: false,
  });
  return event;
}

async function collectEvents<T>(events: AsyncIterable<T>) {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}
