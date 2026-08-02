import {
  isAssistantTone,
  type AssistantTone,
} from "./business-configuration.ts";
import type {
  AssistantResponseEvent,
} from "./grounded-answer.ts";
import {
  detectQuestionLanguage,
  type QuestionLanguage,
} from "./question-language.ts";

export type ConversationalCategory =
  | "greeting"
  | "gratitude"
  | "farewell"
  | "identity"
  | "capability"
  | "out_of_scope"
  | "unclear";

type ConversationalAssistant = {
  name: string;
  serviceScope: string;
  tone: string;
};

type ConversationalTemplate = (
  assistant: ConversationalAssistant,
) => string;

export async function* streamConversationalResponse(input: {
  question: string;
  category: ConversationalCategory;
  language?: QuestionLanguage;
  assistant: ConversationalAssistant;
}): AsyncGenerator<AssistantResponseEvent> {
  const content = createConversationalContent(
    input.category,
    input.language ?? detectQuestionLanguage(input.question),
    input.assistant,
  );

  yield {
    type: "text_delta",
    delta: content,
  };
  yield {
    type: "complete",
    resultType: "conversational_response",
    citations: [],
  };
}

function createConversationalContent(
  category: ConversationalCategory,
  language: QuestionLanguage,
  assistant: ConversationalAssistant,
) {
  const tone = isAssistantTone(assistant.tone)
    ? assistant.tone
    : "professional";
  const configuredLanguage = detectQuestionLanguage(
    `${assistant.name} ${assistant.serviceScope}`,
  );
  const responseLanguage = category === "unclear"
    ? language
    : configuredLanguage;
  return conversationalTemplates[category][responseLanguage][tone](
    assistant,
  );
}

const conversationalTemplates: Record<
  ConversationalCategory,
  Record<
    QuestionLanguage,
    Record<AssistantTone, ConversationalTemplate>
  >
> = {
  greeting: {
    zh: {
      professional: (assistant) =>
        `您好，我是${assistant.name}。您可以咨询${assistant.serviceScope}。`,
      friendly: (assistant) =>
        `你好！我是${assistant.name}，很高兴为你服务。可以问我${assistant.serviceScope}相关的问题。`,
      concise: (assistant) =>
        `你好，我是${assistant.name}。可咨询：${assistant.serviceScope}。`,
    },
    en: {
      professional: (assistant) =>
        `Hello, I'm ${assistant.name}. You can ask me about ${assistant.serviceScope}.`,
      friendly: (assistant) =>
        `Hi! I'm ${assistant.name}. I'm happy to help with ${assistant.serviceScope}.`,
      concise: (assistant) =>
        `Hello, I'm ${assistant.name}. Ask me about ${assistant.serviceScope}.`,
    },
  },
  gratitude: {
    zh: {
      professional: (assistant) =>
        `不客气。如果您还想了解${assistant.serviceScope}，我可以继续协助。`,
      friendly: (assistant) =>
        `不客气！如果还想了解${assistant.serviceScope}，随时问我。`,
      concise: (assistant) =>
        `不客气。还可继续咨询${assistant.serviceScope}。`,
    },
    en: {
      professional: (assistant) =>
        `You're welcome. I can continue to help if you'd like to learn more about ${assistant.serviceScope}.`,
      friendly: (assistant) =>
        `You're welcome! I'm here if you'd like to ask more about ${assistant.serviceScope}.`,
      concise: (assistant) =>
        `You're welcome. I can still help with ${assistant.serviceScope}.`,
    },
  },
  farewell: {
    zh: {
      professional: (assistant) =>
        `再见。需要了解${assistant.serviceScope}时，欢迎随时回来咨询。`,
      friendly: (assistant) =>
        `再见！想了解${assistant.serviceScope}时，随时回来找我。`,
      concise: (assistant) =>
        `再见。需要时可继续咨询${assistant.serviceScope}。`,
    },
    en: {
      professional: (assistant) =>
        `Goodbye. You can return anytime to ask about ${assistant.serviceScope}.`,
      friendly: (assistant) =>
        `Goodbye! Come back anytime if you'd like to ask about ${assistant.serviceScope}.`,
      concise: (assistant) =>
        `Goodbye. Return anytime for ${assistant.serviceScope}.`,
    },
  },
  identity: {
    zh: {
      professional: (assistant) =>
        `我是${assistant.name}，负责协助您了解${assistant.serviceScope}。`,
      friendly: (assistant) =>
        `你好！我是${assistant.name}，负责协助你了解${assistant.serviceScope}。`,
      concise: (assistant) =>
        `我是${assistant.name}，可协助解答${assistant.serviceScope}相关问题。`,
    },
    en: {
      professional: (assistant) =>
        `I'm ${assistant.name}, an assistant for questions about ${assistant.serviceScope}.`,
      friendly: (assistant) =>
        `Hi! I'm ${assistant.name}, here to help you learn about ${assistant.serviceScope}.`,
      concise: (assistant) =>
        `I'm ${assistant.name}. I help with ${assistant.serviceScope}.`,
    },
  },
  capability: {
    zh: {
      professional: (assistant) =>
        `我可以协助您了解${assistant.serviceScope}。`,
      friendly: (assistant) =>
        `我可以帮你了解${assistant.serviceScope}，有相关问题尽管问我。`,
      concise: (assistant) =>
        `我可以协助解答${assistant.serviceScope}相关问题。`,
    },
    en: {
      professional: (assistant) =>
        `I can assist with questions about ${assistant.serviceScope}.`,
      friendly: (assistant) =>
        `I'd be happy to help with ${assistant.serviceScope}.`,
      concise: (assistant) =>
        `I can help with ${assistant.serviceScope}.`,
    },
  },
  out_of_scope: {
    zh: {
      professional: (assistant) =>
        `抱歉，我不能处理这个请求。我可以协助您了解${assistant.serviceScope}。`,
      friendly: (assistant) =>
        `抱歉，这个请求不在我能处理的范围内，不过我很乐意帮你了解${assistant.serviceScope}。`,
      concise: (assistant) =>
        `抱歉，我不能处理这个请求。我可以协助了解${assistant.serviceScope}。`,
    },
    en: {
      professional: (assistant) =>
        `Sorry, I can't handle that request. I can assist with ${assistant.serviceScope}.`,
      friendly: (assistant) =>
        `Sorry, I can't take on that request, but I'd be happy to help with ${assistant.serviceScope}.`,
      concise: (assistant) =>
        `I can't handle that request. I can help with ${assistant.serviceScope}.`,
    },
  },
  unclear: {
    zh: {
      professional: () =>
        "我还不确定您的意思。请告诉我您想了解什么。",
      friendly: () =>
        "我还不太确定你的意思，可以告诉我你想了解什么吗？",
      concise: () => "请说明您想了解的问题。",
    },
    en: {
      professional: () =>
        "I'm not sure what you mean. Please tell me what you'd like help with.",
      friendly: () =>
        "I'm not quite sure what you mean. What would you like help with?",
      concise: () => "Please tell me what you'd like help with.",
    },
  },
};
