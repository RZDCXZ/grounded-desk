import type {
  AssistantResponseEvent,
  GroundedAnswerInput,
} from "./grounded-answer.ts";
import type { ConversationResultType } from "./conversation-result.ts";
import type {
  RequestAnalysis,
  RequestAnalysisLanguage,
} from "./request-analysis.ts";
import {
  responseDecisionAuditSymbol,
  type MultiRequestDecisionAudit,
  type ResponseDecisionAudit,
} from "./response-decision-audit.ts";
import type {
  ResponseSection,
  SectionedAssistantResponseEvent,
} from "./response-sections.ts";

type FactualRequest = RequestAnalysis["factualRequests"][number];

export async function* streamMultiRequestResponse(
  analysis: RequestAnalysis,
  dependencies: {
    assistant: Pick<
      GroundedAnswerInput["assistant"],
      "humanContactLabel" | "humanContactUrl"
    >;
    streamCompleteRequest(
      request: FactualRequest,
    ): AsyncIterable<AssistantResponseEvent>;
  },
): AsyncGenerator<SectionedAssistantResponseEvent> {
  if (
    analysis.factualRequests.length === 0 ||
    analysis.factualRequests.length > 3
  ) {
    throw new Error("逐项回答需要一至三项事实诉求");
  }

  const sections: ResponseSection[] = [];
  const decisions: MultiRequestDecisionAudit["requests"] = [];

  for (const request of analysis.factualRequests) {
    yield {
      type: "section_start",
      section: {
        id: request.id,
        order: request.order,
        status: "streaming",
      },
    };

    const section = request.completeness === "complete"
      ? yield* streamCompleteRequestSection(
          request,
          dependencies.streamCompleteRequest(request),
          decisions,
        )
      : createIncompleteSection(
          request,
          analysis.language,
          dependencies.assistant,
          decisions,
        );

    sections.push(section);
    yield {
      type: "section_complete",
      section,
    };
  }

  const resultType = mapMessageResult(sections);
  const completion: SectionedAssistantResponseEvent = {
    type: "message_complete",
    resultType,
    sections,
    ...createClarificationState(sections, decisions),
  };
  const audit: MultiRequestDecisionAudit = {
    version: "multi-request-decision-v1",
    requestAnalysisVersion: analysis.version,
    responseStrategyVersion: "multi-request-response-v1",
    resultType,
    requests: decisions,
  };
  Object.defineProperty(completion, responseDecisionAuditSymbol, {
    value: audit,
    enumerable: false,
  });
  yield completion;
}

async function* streamCompleteRequestSection(
  request: FactualRequest,
  events: AsyncIterable<AssistantResponseEvent>,
  decisions: MultiRequestDecisionAudit["requests"],
): AsyncGenerator<SectionedAssistantResponseEvent, ResponseSection> {
  let content = "";

  for await (const event of events) {
    if (event.type === "text_delta") {
      content += event.delta;
      yield {
        type: "section_delta",
        sectionId: request.id,
        delta: event.delta,
      };
      continue;
    }

    const audit = (event as AssistantResponseEvent & {
      [responseDecisionAuditSymbol]?: ResponseDecisionAudit;
    })[responseDecisionAuditSymbol];
    if (!audit || audit.factualRequest.id !== request.id) {
      throw new Error("逐项回答缺少匹配的证据覆盖审计");
    }
    decisions.push({
      factualRequest: {
        id: request.id,
        order: request.order,
        originalText: request.originalText,
        normalizedQuestion: request.normalizedQuestion,
        completeness: "complete",
        missingInformation: [],
        clarificationRound: 0,
      },
      outcome: audit.coverage.status,
      coverage: audit.coverage,
    });

    if (event.type === "refusal") {
      return {
        id: request.id,
        order: request.order,
        title: request.originalText,
        status: "unsupported",
        content: event.message,
        citations: [],
        contact: event.contact,
      };
    }

    if (
      event.resultType !== "grounded_answer" &&
      event.resultType !== "knowledge_conflict"
    ) {
      throw new Error("完整事实诉求返回了非知识结果");
    }

    return {
      id: request.id,
      order: request.order,
      title: request.originalText,
      status: event.resultType === "grounded_answer"
        ? "supported"
        : "conflicting",
      content,
      citations: event.citations,
    };
  }

  throw new Error("逐项回答流缺少完成事件");
}

function createIncompleteSection(
  request: FactualRequest,
  language: RequestAnalysisLanguage,
  assistant: Pick<
    GroundedAnswerInput["assistant"],
    "humanContactLabel" | "humanContactUrl"
  >,
  decisions: MultiRequestDecisionAudit["requests"],
): ResponseSection {
  const handoff = request.requiresHumanHandoff === true;
  const content = handoff
    ? language === "en"
      ? `The following information is still needed: ${request.missingInformation.join("; ")}. Please contact the human support team.`
      : `目前仍缺少：${request.missingInformation.join("、")}。请联系人工团队协助。`
    : language === "en"
      ? `Please clarify: ${request.missingInformation.join("; ")}.`
      : `请补充：${request.missingInformation.join("；")}。`;
  decisions.push({
    factualRequest: {
      id: request.id,
      order: request.order,
      originalText: request.originalText,
      normalizedQuestion: request.normalizedQuestion,
      completeness: "incomplete",
      missingInformation: request.missingInformation,
      clarificationRound:
        request.clarificationRound === 2 ? 2 : 1,
    },
    outcome: handoff ? "human_handoff" : "clarification_request",
  });

  return {
    id: request.id,
    order: request.order,
    title: request.originalText,
    status: handoff ? "handoff" : "clarification",
    content,
    citations: [],
    ...(handoff
      ? {
          contact: {
            label: assistant.humanContactLabel,
            url: assistant.humanContactUrl,
          },
        }
      : {}),
  };
}

function mapMessageResult(
  sections: ResponseSection[],
): ConversationResultType {
  const supported = sections.filter(
    ({ status }) => status === "supported",
  ).length;
  if (supported === sections.length) {
    return "grounded_answer";
  }
  if (supported > 0) {
    return "partially_grounded_answer";
  }
  if (sections.some(({ status }) => status === "clarification")) {
    return "clarification_request";
  }
  if (sections.some(({ status }) => status === "handoff")) {
    return "human_handoff";
  }
  if (sections.some(({ status }) => status === "conflicting")) {
    return "knowledge_conflict";
  }
  return "grounded_refusal";
}

function createClarificationState(
  sections: ResponseSection[],
  decisions: MultiRequestDecisionAudit["requests"],
) {
  const clarificationStates = decisions.flatMap((decision) => {
    if (decision.outcome !== "clarification_request") {
      return [];
    }
    const section = sections.find(
      ({ id }) => id === decision.factualRequest.id,
    );
    return section
      ? [{
          originalText: decision.factualRequest.originalText,
          round:
            decision.factualRequest.clarificationRound as 1 | 2,
          latestClarification: section.content,
        }]
      : [];
  });
  if (clarificationStates.length === 0) {
    return {};
  }
  return {
    clarificationState: clarificationStates[0],
    clarificationStates,
  };
}
