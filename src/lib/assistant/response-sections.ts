import type {
  AssistantResponseEvent as LegacyAssistantResponseEvent,
  GroundedCitation,
} from "./grounded-answer.ts";
import type { ConversationResultType } from "./conversation-result.ts";

export type ResponseSectionStatus =
  | "supported"
  | "unsupported"
  | "conversational"
  | "clarification";

export type ResponseSection = {
  id: string;
  order: number;
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
    };

type AssistantResponsePresentationState = {
  answer: string;
  citations: GroundedCitation[];
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
    });

export function reduceAssistantResponsePresentation(
  current: AssistantResponsePresentationState,
  event: SectionedAssistantResponseEvent | LegacyAssistantResponseEvent,
): AssistantResponsePresentationUpdate | undefined {
  if (event.type === "text_delta" || event.type === "section_delta") {
    return {
      status: "streaming",
      answer: current.answer + event.delta,
      citations: current.citations,
    };
  }

  if (event.type === "section_complete") {
    if (event.section.status === "unsupported") {
      return {
        status: "refusal",
        answer: current.answer,
        citations: [],
        message: event.section.content,
        contact: event.section.contact,
      };
    }

    return {
      status: "streaming",
      answer: event.section.content,
      citations: event.section.citations,
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
    if (event.resultType === "grounded_refusal") {
      return undefined;
    }

    return {
      status: "complete",
      resultType: event.resultType,
      answer: current.answer,
      citations: current.citations,
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
      };
      yield {
        type: "section_complete",
        section,
      };
      yield {
        type: "message_complete",
        resultType: event.resultType,
        sections: [section],
      };
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
    yield {
      type: "message_complete",
      resultType: event.resultType,
      sections: [section],
    };
    return;
  }

  throw new Error("单项回答流缺少完成事件");
}

const completionStatus = {
  grounded_answer: "supported",
  conversational_response: "conversational",
  clarification_request: "clarification",
} as const;
