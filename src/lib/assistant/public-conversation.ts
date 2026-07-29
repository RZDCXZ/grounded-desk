import { createAssistantPreviewResponse } from "./preview-response.ts";
import type {
  ConversationContextMessage,
  GroundedAnswerEvent,
  GroundedCitation,
} from "./grounded-answer.ts";
import { detectQuestionLanguage } from "./question-language.ts";

const MAXIMUM_QUESTION_LENGTH = 2_000;

export type PublicConversationStart = {
  conversationId: string;
  assistantMessageId: string;
  organizationId: string;
  context?: ConversationContextMessage[];
  assistant: {
    name: string;
    serviceScope: string;
    tone: string;
    humanContactLabel: string;
    humanContactUrl: string;
  };
};

export type PublicConversationBlockReason =
  | "answer_in_progress"
  | "rate_limited"
  | "question_limit"
  | "daily_budget"
  | "conversation_not_found"
  | "retry_not_available";

export type PublicConversationBlocked = {
  blockedReason: PublicConversationBlockReason;
  conversationId?: string;
  contact: {
    label: string;
    url: string;
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
    conversationId?: string,
    retry?: boolean,
  ): Promise<
    PublicConversationStart | PublicConversationBlocked | null
  >;
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
    questionResult.conversationId,
    questionResult.retry,
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

  if ("blockedReason" in conversation) {
    return createBlockedResponse(
      conversation,
      questionResult.question,
    );
  }

  const response = createAssistantPreviewResponse(
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
    detectQuestionLanguage(questionResult.question),
  );
  response.headers.set("x-conversation-id", conversation.conversationId);
  response.headers.set(
    "x-assistant-message-id",
    conversation.assistantMessageId,
  );
  return response;
}

function createBlockedResponse(
  blocked: PublicConversationBlocked,
  question: string,
) {
  const language = detectQuestionLanguage(question);
  const descriptions = {
    answer_in_progress: {
      status: 409,
      zh: "当前会话已有回答正在生成，请等待完成后再提问。",
      en: "An answer is already being generated in this conversation. Please wait for it to finish.",
    },
    rate_limited: {
      status: 429,
      zh: "当前会话每分钟最多发送五条消息，请稍后再试。",
      en: "This conversation accepts at most five messages per minute. Please try again shortly.",
    },
    question_limit: {
      status: 409,
      zh: "当前会话已达到三十个问题的上限，请开始新会话。",
      en: "This conversation has reached its 30-question limit. Please start a new conversation.",
    },
    daily_budget: {
      status: 503,
      zh: "今日 AI 咨询额度已用完，请通过人工联系入口继续咨询。",
      en: "Today's AI consultation budget has been reached. Please use the human contact option.",
    },
    conversation_not_found: {
      status: 404,
      zh: "当前会话已失效，请开始新会话。",
      en: "This conversation is no longer available. Please start a new conversation.",
    },
    retry_not_available: {
      status: 409,
      zh: "原问题当前无法重试，请开始新会话。",
      en: "The original question can no longer be retried. Please start a new conversation.",
    },
  } as const;
  const description = descriptions[blocked.blockedReason];

  return Response.json(
    {
      code: blocked.blockedReason,
      message: description[language],
      conversationId: blocked.conversationId,
      canStartNewConversation:
        blocked.blockedReason === "question_limit" ||
        blocked.blockedReason === "conversation_not_found" ||
        blocked.blockedReason === "retry_not_available",
      contact: blocked.contact,
    },
    {
      status: description.status,
      headers: {
        "cache-control": "no-store",
      },
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
  const conversationId =
    typeof payload === "object" &&
    payload !== null &&
    "conversationId" in payload &&
    typeof payload.conversationId === "string" &&
    payload.conversationId.trim()
      ? payload.conversationId.trim()
      : undefined;
  const retry =
    typeof payload === "object" &&
    payload !== null &&
    "retry" in payload &&
    payload.retry === true;

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
    conversationId,
    retry,
  };
}
