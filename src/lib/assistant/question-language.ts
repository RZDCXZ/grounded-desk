import "server-only";

import englishWords from "an-array-of-english-words/index.json" with {
  type: "json",
};

export type QuestionLanguage = "zh" | "en";

const englishWordSet = new Set(englishWords);
const shortEnglishWords = new Set([
  "a",
  "am",
  "an",
  "as",
  "at",
  "be",
  "by",
  "do",
  "go",
  "he",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "no",
  "of",
  "on",
  "or",
  "so",
  "to",
  "up",
  "us",
  "we",
]);

export function detectQuestionLanguage(question: string): QuestionLanguage {
  if (/\p{Script=Han}/u.test(question)) {
    return "zh";
  }

  const words = question.match(/[A-Za-z]+(?:'[A-Za-z]+)?/gu) ?? [];
  const meaningfulWords = words.filter(
    (word) => word.length < 2 || word !== word.toLocaleUpperCase("en"),
  );

  if (meaningfulWords.length === 0) {
    return "zh";
  }

  const englishWordsCount = meaningfulWords.filter((word) => {
    const normalized = word.toLocaleLowerCase("en");
    return normalized.length <= 2
      ? shortEnglishWords.has(normalized)
      : englishWordSet.has(normalized);
  }).length;

  return englishWordsCount / meaningfulWords.length >= 0.6 ? "en" : "zh";
}
