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
  | "out_of_scope";

export type ConversationInputRoute =
  | {
      type: "conversational_response";
      category: ConversationalCategory;
    }
  | {
      type: "knowledge";
    };

type ConversationalAssistant = {
  name: string;
  serviceScope: string;
  tone: string;
};

type ConversationalTemplate = (
  assistant: ConversationalAssistant,
) => string;

const chineseGreetings = new Set([
  "你好",
  "您好",
  "嗨",
  "哈喽",
  "在吗",
  "在不在",
  "有人吗",
]);

const englishGreetings = new Set([
  "hello",
  "hi",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
]);

const chineseGratitude = new Set([
  "谢谢",
  "多谢",
  "感谢",
  "谢谢你",
  "辛苦了",
]);

const englishGratitude = new Set([
  "thanks",
  "thank you",
  "thanks a lot",
  "much appreciated",
]);

const chineseFarewells = new Set([
  "再见",
  "拜拜",
  "回头见",
  "下次见",
]);

const englishFarewells = new Set([
  "goodbye",
  "bye",
  "bye bye",
  "see you",
  "see you later",
]);

const chineseIdentityQuestions = new Set([
  "你是谁",
  "请问你是谁",
  "你叫什么",
  "你叫什么名字",
  "你是哪个助手",
]);

const englishIdentityQuestions = new Set([
  "who are you",
  "what is your name",
  "what's your name",
  "which assistant are you",
]);

const chineseCapabilityQuestions = new Set([
  "你能做什么",
  "你会什么",
  "你可以做什么",
  "可以帮我做什么",
  "你能帮我什么",
  "你的服务范围是什么",
  "你能提供什么帮助",
]);

const englishCapabilityQuestions = new Set([
  "what can you do",
  "how can you help",
  "what can you help with",
  "what do you help with",
  "what are your capabilities",
]);

export function routeConversationInput(
  question: string,
): ConversationInputRoute {
  const normalized = normalizeStandaloneExpression(question);

  if (
    matchesStandaloneCategory(
      normalized,
      chineseGreetings,
      englishGreetings,
    )
  ) {
    return {
      type: "conversational_response",
      category: "greeting",
    };
  }

  if (isExplicitlyOutOfScope(normalized)) {
    return {
      type: "conversational_response",
      category: "out_of_scope",
    };
  }

  if (
    matchesStandaloneCategory(
      normalized,
      chineseCapabilityQuestions,
      englishCapabilityQuestions,
    )
  ) {
    return {
      type: "conversational_response",
      category: "capability",
    };
  }

  if (
    matchesStandaloneCategory(
      normalized,
      chineseIdentityQuestions,
      englishIdentityQuestions,
    )
  ) {
    return {
      type: "conversational_response",
      category: "identity",
    };
  }

  if (
    matchesStandaloneCategory(
      normalized,
      chineseFarewells,
      englishFarewells,
    )
  ) {
    return {
      type: "conversational_response",
      category: "farewell",
    };
  }

  if (
    matchesStandaloneCategory(
      normalized,
      chineseGratitude,
      englishGratitude,
    )
  ) {
    return {
      type: "conversational_response",
      category: "gratitude",
    };
  }

  return { type: "knowledge" };
}

export async function* streamConversationalResponse(input: {
  question: string;
  category: ConversationalCategory;
  assistant: ConversationalAssistant;
}): AsyncGenerator<AssistantResponseEvent> {
  const content = createConversationalContent(
    input.category,
    detectQuestionLanguage(input.question),
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

export function streamRoutedAssistantResponse(input: {
  question: string;
  route: ConversationInputRoute;
  assistant: ConversationalAssistant;
  streamKnowledgeAnswer(): AsyncIterable<AssistantResponseEvent>;
}): AsyncIterable<AssistantResponseEvent> {
  return input.route.type === "conversational_response"
    ? streamConversationalResponse({
        question: input.question,
        category: input.route.category,
        assistant: input.assistant,
      })
    : input.streamKnowledgeAnswer();
}

function createConversationalContent(
  category: ConversationalCategory,
  language: QuestionLanguage,
  assistant: ConversationalAssistant,
) {
  const tone = isAssistantTone(assistant.tone)
    ? assistant.tone
    : "professional";
  return conversationalTemplates[category][language][tone](assistant);
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
};

function normalizeStandaloneExpression(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/^[\s,.!?，。！？、；;：:~～]+/u, "")
    .replace(/[\s,.!?，。！？、；;：:~～]+$/u, "")
    .replace(/\s+/gu, " ");
}

function matchesStandaloneCategory(
  value: string,
  chineseExpressions: ReadonlySet<string>,
  englishExpressions: ReadonlySet<string>,
) {
  const expressions = new Set([
    ...chineseExpressions,
    ...englishExpressions,
  ]);

  if (expressions.has(value)) {
    return true;
  }

  const segments = value
    .split(/[,.!?，。！？、;；:：/|]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return (
    segments.length > 1 &&
    segments.every((segment) => expressions.has(segment))
  );
}

function isExplicitlyOutOfScope(value: string) {
  return [
    /^(?:请|麻烦)?(?:给我|帮我)?(?:写|生成|编写)(?:一段|一个|个)?\s*.*(?:代码|程序|脚本)$/u,
    /^(?:请)?(?:给我|帮我)?(?:讲|说|编)(?:一个|个)?(?:笑话|段子)$/u,
    /^(?:请|麻烦)?(?:给我|帮我)?(?:写|生成|创作)(?:一首|一篇|个)?\s*(?:诗|故事|文章)$/u,
    /^(?:please )?(?:tell me|give me) (?:a )?(?:joke|story)$/u,
    /^(?:please )?(?:write|generate|create)(?: me)? .*(?:code|script|program|poem|story)$/u,
  ].some((pattern) => pattern.test(value));
}
