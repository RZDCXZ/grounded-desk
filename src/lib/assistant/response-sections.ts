import type {
  AssistantResponseEvent as LegacyAssistantResponseEvent,
  AuditedAssistantResponseEvent,
  GroundedCitation,
} from "./grounded-answer.ts";
import {
  responseDecisionAuditSymbol,
  type AssistantDecisionAudit,
  type ClarificationThreadState,
} from "./response-decision-audit.ts";
import type { ConversationResultType } from "./conversation-result.ts";

export const PARTIAL_ANSWER_FEEDBACK_PROMPT =
  "以上已回答部分有帮助吗？";

export type ResponseSectionStatus =
  | "supported"
  | "unsupported"
  | "conflicting"
  | "conversational"
  | "clarification"
  | "handoff";

export type ResponseSection = {
  id: string;
  order: number;
  title?: string;
  status: ResponseSectionStatus;
  content: string;
  citations: GroundedCitation[];
  contact?: {
    label: string;
    url: string;
  };
};

export type SectionedAssistantResponseEvent =
  | {
      type: "section_start";
      section: {
        id: string;
        order: number;
        status: "streaming";
      };
    }
  | {
      type: "section_delta";
      sectionId: string;
      delta: string;
    }
  | {
      type: "section_complete";
      section: ResponseSection;
    }
  | {
      type: "message_complete";
      resultType: ConversationResultType;
      sections: ResponseSection[];
      clarificationState?: ClarificationThreadState;
      clarificationStates?: ClarificationThreadState[];
    };

export type AuditedSectionedAssistantResponseEvent =
  SectionedAssistantResponseEvent & {
    [responseDecisionAuditSymbol]?: AssistantDecisionAudit;
  };

type AssistantResponsePresentationState = {
  answer: string;
  citations: GroundedCitation[];
  sections?: ResponseSection[];
};

export type AssistantResponsePresentationUpdate =
  | (AssistantResponsePresentationState & {
      status: "streaming";
    })
  | (AssistantResponsePresentationState & {
      status: "complete";
      resultType: ConversationResultType;
    })
  | (AssistantResponsePresentationState & {
      status: "refusal";
      message: string;
      contact?: {
        label: string;
        url: string;
      };
    })
  | (AssistantResponsePresentationState & {
      status: "conflict";
      message: string;
    })
  | (AssistantResponsePresentationState & {
      status: "handoff";
      message: string;
      contact: {
        label: string;
        url: string;
      };
    });

export function reduceAssistantResponsePresentation(
  current: AssistantResponsePresentationState,
  event: SectionedAssistantResponseEvent | LegacyAssistantResponseEvent,
): AssistantResponsePresentationUpdate | undefined {
  if (event.type === "section_start") {
    return {
      status: "streaming",
      answer: "",
      citations: [],
      ...(current.sections ? { sections: current.sections } : {}),
    };
  }

  if (event.type === "text_delta" || event.type === "section_delta") {
    return {
      status: "streaming",
      answer: current.answer + event.delta,
      citations: current.citations,
      ...(current.sections ? { sections: current.sections } : {}),
    };
  }

  if (event.type === "section_complete") {
    const sections = [
      ...(current.sections ?? []),
      event.section,
    ];
    if (
      event.section.status === "handoff" &&
      !event.section.contact
    ) {
      throw new Error("人工接续分段缺少联系入口");
    }

    return {
      status: "streaming",
      answer: "",
      citations: [],
      sections,
    };
  }

  if (event.type === "complete") {
    return {
      status: "complete",
      resultType: event.resultType,
      answer: current.answer,
      citations: event.citations,
    };
  }

  if (event.type === "message_complete") {
    if (event.sections.length > 1) {
      return {
        status: "complete",
        resultType: event.resultType,
        answer: "",
        citations: event.sections.flatMap(
          ({ citations }) => citations,
        ),
        sections: event.sections,
      };
    }

    const section = event.sections[0];
    if (event.resultType === "grounded_refusal" && section) {
      return {
        status: "refusal",
        answer: "",
        citations: [],
        message: section.content,
        contact: section.contact,
        sections: event.sections,
      };
    }
    if (event.resultType === "knowledge_conflict" && section) {
      return {
        status: "conflict",
        answer: "",
        citations: section.citations,
        message: section.content,
        sections: event.sections,
      };
    }
    if (event.resultType === "human_handoff" && section?.contact) {
      return {
        status: "handoff",
        answer: "",
        citations: [],
        message: section.content,
        contact: section.contact,
        sections: event.sections,
      };
    }

    return {
      status: "complete",
      resultType: event.resultType,
      answer: section?.content ?? current.answer,
      citations: section?.citations ?? current.citations,
      sections: undefined,
      ...(event.resultType === "partially_grounded_answer" ||
          event.sections.length > 1
        ? { sections: event.sections }
        : {}),
    };
  }

  if (event.type === "refusal") {
    return {
      status: "refusal",
      answer: current.answer,
      citations: [],
      message: event.message,
      contact: event.contact,
    };
  }

  return undefined;
}

export async function* streamSingleSectionResponse(
  events: AsyncIterable<LegacyAssistantResponseEvent>,
  sectionId: string,
): AsyncGenerator<SectionedAssistantResponseEvent> {
  let content = "";

  yield {
    type: "section_start",
    section: {
      id: sectionId,
      order: 1,
      status: "streaming",
    },
  };

  for await (const event of events) {
    if (event.type === "text_delta") {
      content += event.delta;
      yield {
        type: "section_delta",
        sectionId,
        delta: event.delta,
      };
      continue;
    }

    if (event.type === "complete") {
      const section: ResponseSection = {
        id: sectionId,
        order: 1,
        status: completionStatus[event.resultType],
        content,
        citations: event.citations,
        ...(
          event.resultType === "human_handoff"
            ? { contact: event.contact }
            : {}
        ),
      };
      yield {
        type: "section_complete",
        section,
      };
      const messageComplete: SectionedAssistantResponseEvent = {
        type: "message_complete",
        resultType: event.resultType,
        sections: [section],
        ...createClarificationThreadState(event, section),
      };
      yield attachDecisionAudit(messageComplete, event);
      return;
    }

    const section: ResponseSection = {
      id: sectionId,
      order: 1,
      status: "unsupported",
      content: event.message,
      citations: [],
      contact: event.contact,
    };
    yield {
      type: "section_complete",
      section,
    };
    yield attachDecisionAudit({
      type: "message_complete",
      resultType: event.resultType,
      sections: [section],
    }, event);
    return;
  }

  throw new Error("单项回答流缺少完成事件");
}

function attachDecisionAudit(
  sectionEvent: SectionedAssistantResponseEvent,
  legacyEvent: LegacyAssistantResponseEvent,
) {
  const audit = (legacyEvent as AuditedAssistantResponseEvent)[
    responseDecisionAuditSymbol
  ];
  if (audit) {
    Object.defineProperty(sectionEvent, responseDecisionAuditSymbol, {
      value: audit,
      enumerable: false,
    });
  }
  return sectionEvent;
}

const completionStatus = {
  grounded_answer: "supported",
  knowledge_conflict: "conflicting",
  conversational_response: "conversational",
  clarification_request: "clarification",
  human_handoff: "handoff",
} as const;

function createClarificationThreadState(
  event: LegacyAssistantResponseEvent,
  section: ResponseSection,
) {
  const audit = (event as AuditedAssistantResponseEvent)[
    responseDecisionAuditSymbol
  ];

  return audit &&
      "outcome" in audit &&
      audit.outcome === "clarification_request"
    ? {
        clarificationState: {
          originalText: audit.factualRequest.originalText,
          round: audit.factualRequest.clarificationRound,
          latestClarification: section.content,
        } satisfies ClarificationThreadState,
      }
    : {};
}
