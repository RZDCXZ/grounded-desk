import type { ConversationContextMessage } from "./grounded-answer.ts";
import {
  detectQuestionLanguage,
  type QuestionLanguage,
} from "./question-language.ts";

const MAXIMUM_CHINESE_TOPIC_LENGTH = 20;
const MAXIMUM_ENGLISH_TOPIC_WORDS = 4;
const clarifiableChineseTopics = new Set([
  "退款",
  "价格",
  "报价",
  "费用",
  "发票",
  "订单",
  "配送",
  "物流",
  "售后",
  "保修",
  "服务",
  "套餐",
  "账户",
  "登录",
  "支付",
  "付款",
  "交付",
  "时间",
  "流程",
]);
const clarifiableEnglishTopics = new Set([
  "refund",
  "refunds",
  "price",
  "prices",
  "pricing",
  "quote",
  "quotes",
  "cost",
  "costs",
  "invoice",
  "invoices",
  "order",
  "orders",
  "delivery",
  "shipping",
  "warranty",
  "service",
  "services",
  "account",
  "login",
  "payment",
  "payments",
  "timeline",
  "process",
]);

export function createClarificationRequest(
  question: string,
  context: ConversationContextMessage[],
) {
  if (lastAssistantResultIsClarification(context)) {
    return null;
  }

  const language = detectQuestionLanguage(question);
  const topic = extractIncompleteTopic(question, language);

  if (!topic) {
    return null;
  }

  return language === "en"
    ? `What would you like to know about “${topic}”? Please add a specific question.`
    : `您想了解“${topic}”的哪一方面？请补充具体问题。`;
}

function extractIncompleteTopic(
  question: string,
  language: QuestionLanguage,
) {
  const topic = question
    .normalize("NFKC")
    .trim()
    .replace(
      /^[\s,，。.!！?？;；:：]+|[\s,，。.!！?？;；:：]+$/gu,
      "",
    );

  if (!topic) {
    return null;
  }

  if (language === "en") {
    const words = topic.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/gu);
    if (
      !words ||
      words.join(" ") !== topic ||
      words.length > MAXIMUM_ENGLISH_TOPIC_WORDS
    ) {
      return null;
    }

    const normalizedWords = words.map((word) =>
      word.toLocaleLowerCase("en")
    );
    const baseWords = normalizedWords.filter(
      (word) => word !== "details" && word !== "information",
    );
    if (
      baseWords.length !== 1 ||
      !clarifiableEnglishTopics.has(baseWords[0] ?? "")
    ) {
      return null;
    }

    return topic;
  }

  if (
    [...topic].length > MAXIMUM_CHINESE_TOPIC_LENGTH ||
    !/^[\p{Script=Han}\s]+$/u.test(topic)
  ) {
    return null;
  }

  const baseTopic = topic.replace(
    /(?:方面|相关|问题|咨询)$/u,
    "",
  );
  return clarifiableChineseTopics.has(baseTopic) ? topic : null;
}

function lastAssistantResultIsClarification(
  context: ConversationContextMessage[],
) {
  for (let index = context.length - 1; index >= 0; index -= 1) {
    const message = context[index];
    if (message?.role === "assistant") {
      return message.resultType === "clarification_request";
    }
  }

  return false;
}
