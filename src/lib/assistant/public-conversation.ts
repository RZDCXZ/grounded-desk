import { createAssistantPreviewResponse } from "./preview-response.ts";
import type {
  GroundedAnswerEvent,
  GroundedCitation,
} from "./grounded-answer.ts";

const MAXIMUM_QUESTION_LENGTH = 2_000;

export type PublicConversationStart = {
  conversationId: string;
  assistantMessageId: string;
  organizationId: string;
  assistant: {
    name: string;
    serviceScope: string;
    tone: string;
    humanContactLabel: string;
    humanContactUrl: string;
  };
};

export type PublicConversationOutcome = {
  type: "grounded_answer" | "grounded_refusal";
  content: string;
  citations: GroundedCitation[];
};

type PublicConversationDependencies = {
  beginConversation(
    publicId: string,
    question: string,
  ): Promise<PublicConversationStart | null>;
  streamAnswer(
    start: PublicConversationStart & { question: string },
  ): AsyncIterable<GroundedAnswerEvent>;
  completeConversation(
    start: PublicConversationStart,
    outcome: PublicConversationOutcome,
  ): Promise<void>;
  failConversation(start: PublicConversationStart): Promise<void>;
};

export async function createPublicConversationResponse(
  request: Request,
  publicId: string,
  dependencies: PublicConversationDependencies,
) {
  const questionResult = await readQuestion(request);

  if (questionResult.status === "invalid") {
    return Response.json(
      { message: questionResult.message },
      { status: 400 },
    );
  }

  const conversation = await dependencies.beginConversation(
    publicId,
    questionResult.question,
  );

  if (!conversation) {
    return Response.json(
      { message: "该助手当前不可公开访问。" },
      {
        status: 404,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  return createAssistantPreviewResponse(
    persistConversationOutcome(
      dependencies.streamAnswer({
        ...conversation,
        question: questionResult.question,
      }),
      conversation,
      dependencies,
    ),
    {
      label: conversation.assistant.humanContactLabel,
      url: conversation.assistant.humanContactUrl,
    },
  );
}

async function* persistConversationOutcome(
  events: AsyncIterable<GroundedAnswerEvent>,
  conversation: PublicConversationStart,
  dependencies: PublicConversationDependencies,
) {
  let answer = "";

  try {
    for await (const event of events) {
      if (event.type === "text_delta") {
        answer += event.delta;
      } else if (event.type === "complete") {
        await dependencies.completeConversation(conversation, {
          type: "grounded_answer",
          content: answer,
          citations: event.citations,
        });
      } else {
        await dependencies.completeConversation(conversation, {
          type: "grounded_refusal",
          content: event.message,
          citations: [],
        });
      }

      yield event;
    }
  } catch (error) {
    await dependencies.failConversation(conversation);
    throw error;
  }
}

async function readQuestion(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return {
      status: "invalid" as const,
      message: "请输入要咨询的问题。",
    };
  }

  const question =
    typeof payload === "object" &&
    payload !== null &&
    "question" in payload &&
    typeof payload.question === "string"
      ? payload.question.trim()
      : "";

  if (!question) {
    return {
      status: "invalid" as const,
      message: "请输入要咨询的问题。",
    };
  }

  if (question.length > MAXIMUM_QUESTION_LENGTH) {
    return {
      status: "invalid" as const,
      message: `问题不能超过 ${MAXIMUM_QUESTION_LENGTH} 个字符。`,
    };
  }

  return {
    status: "valid" as const,
    question,
  };
}
