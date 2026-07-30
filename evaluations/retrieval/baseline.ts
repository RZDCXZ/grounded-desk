import {
  streamGroundedAnswer,
  type AssistantResponseEvent,
  type GroundedEvidence,
  type RetrievedContentUnit,
} from "../../src/lib/assistant/grounded-answer.ts";
import {
  readRetrievalConfig,
  type RetrievalConfig,
} from "../../src/lib/assistant/retrieval-config.ts";

type EvaluationLanguage = "zh" | "en";

type AnswerExpectation = {
  type: "answer";
  expectedKnowledgeSourceIds: string[];
  answerStatements: string[];
};

type RefusalExpectation = {
  type: "refusal";
};

type RankedCandidate = RetrievedContentUnit & {
  rerankScore: number;
};

type EvaluationContentUnit = RetrievedContentUnit & {
  answerStatements: Record<EvaluationLanguage, string>;
};

type ExpectedCandidate = {
  unit: EvaluationContentUnit;
  retrievalRank: number;
  rerankScore: number;
};

type RetrievalEvaluationCase = {
  id: string;
  language: EvaluationLanguage;
  question: string;
  expectation: AnswerExpectation | RefusalExpectation;
  candidates: RankedCandidate[];
};

type CaseFailure =
  | "false_refusal"
  | "false_answer"
  | "unexpected_clarification"
  | "unsupported_fact"
  | "missing_citation"
  | "unexpected_citation"
  | "language_mismatch"
  | "technical_error";

type EvaluationCaseResult = {
  id: string;
  language: EvaluationLanguage;
  expected: "answer" | "refusal";
  actual:
    | "answer"
    | "refusal"
    | "clarification"
    | "technical_error";
  passed: boolean;
  failures: CaseFailure[];
};

export type RetrievalEvaluationSummary = {
  config: RetrievalConfig;
  dataset: {
    total: number;
    answerable: number;
    refusal: number;
    languages: Record<EvaluationLanguage, number>;
  };
  outcomes: {
    groundedAnswers: number;
    groundedRefusals: number;
    clarifications: number;
    correct: number;
    passRate: number;
  };
  failures: {
    falseRefusals: number;
    falseAnswers: number;
    unexpectedClarifications: number;
    unsupportedFacts: number;
    missingCitations: number;
    unexpectedCitations: number;
    languageMismatches: number;
    technicalErrors: number;
  };
  byLanguage: Record<
    EvaluationLanguage,
    {
      total: number;
      correct: number;
      contractViolations: number;
    }
  >;
  cases: EvaluationCaseResult[];
  passed: boolean;
};

const ORGANIZATION_ID = "retrieval-evaluation-organization";
const ASSISTANT = {
  name: "北辰工作室顾问",
  serviceScope: "依据北辰工作室的固定离线知识回答服务问题。",
  tone: "professional",
  humanContactLabel: "联系人工",
  humanContactUrl: "mailto:hello@example.test",
};

const sourceUnits = {
  services: contentUnit(
    "services",
    "服务范围",
    "北辰工作室提供知识整理、来源核查和有据回答配置服务。",
    "Northstar Studio provides knowledge organization, source verification, and grounded-answer configuration services.",
  ),
  servicesEvidence: contentUnit(
    "services-evidence",
    "服务范围",
    "服务以可核查的知识来源作为业务事实依据。",
    "The service uses verifiable knowledge sources as evidence for business facts.",
    "services",
  ),
  support: contentUnit(
    "support",
    "响应方式",
    "工作日提交的问题会在两个工作小时内确认。",
    "Questions submitted on business days are acknowledged within two business hours.",
  ),
  supportFollowup: contentUnit(
    "support-followup",
    "响应方式",
    "问题确认后会通过约定的人工联系入口继续跟进。",
    "After acknowledgement, the question is followed up through the agreed human contact channel.",
    "support",
  ),
  process: contentUnit(
    "process",
    "合作流程",
    "合作流程包括需求确认、知识整理、预览验收和上线。",
    "The engagement process includes requirements confirmation, knowledge organization, preview acceptance, and launch.",
  ),
  deliverables: contentUnit(
    "deliverables",
    "交付内容",
    "项目交付物包括知识来源清单、助手配置和嵌入代码。",
    "Project deliverables include a knowledge-source list, assistant configuration, and embed code.",
  ),
  pricing: contentUnit(
    "pricing",
    "沟通与报价",
    "首次需求沟通免费，正式项目在范围确认后提供书面报价。",
    "The initial requirements discussion is free, and a written quote is provided after the project scope is confirmed.",
  ),
  contact: contentUnit(
    "contact",
    "人工联系",
    "人工联系邮箱是 hello@example.test，工作日受理。",
    "The human contact email is hello@example.test and is monitored on business days.",
  ),
  embedding: contentUnit(
    "embedding",
    "网站接入",
    "助手可以通过公开链接或 iframe 悬浮入口接入网站。",
    "The assistant can be added to a website through a public link or a floating iframe entry point.",
  ),
  languages: contentUnit(
    "languages",
    "语言支持",
    "助手支持中文和英文问题，混合语言默认使用中文。",
    "The assistant supports questions in Chinese and English, with mixed-language questions defaulting to Chinese.",
  ),
  retention: contentUnit(
    "retention",
    "数据保留",
    "匿名会话默认保留三十天。",
    "Anonymous conversations are retained for thirty days by default.",
  ),
  updates: contentUnit(
    "updates",
    "知识更新",
    "新知识版本处理成功后会原子替换旧版本。",
    "A new knowledge revision atomically replaces the old revision after successful processing.",
  ),
} as const;

const answerableCases: RetrievalEvaluationCase[] = [
  answerCase(
    "zh-services-and-response",
    "zh",
    "你们提供哪些服务、以什么为事实依据，工作日如何确认和跟进，合作流程是什么？",
    [
      expectedCandidate(sourceUnits.services, 2, 0.93),
      expectedCandidate(sourceUnits.servicesEvidence, 5, 0.82),
      expectedCandidate(sourceUnits.support, 9, 0.72),
      expectedCandidate(sourceUnits.supportFollowup, 14, 0.62),
      expectedCandidate(sourceUnits.process, 20, 0.5),
    ],
  ),
  answerCase(
    "zh-process",
    "zh",
    "合作流程有哪些步骤？",
    [expectedCandidate(sourceUnits.process, 4)],
  ),
  answerCase(
    "zh-deliverables",
    "zh",
    "项目会交付哪些内容？",
    [expectedCandidate(sourceUnits.deliverables, 6)],
  ),
  answerCase(
    "zh-pricing",
    "zh",
    "首次沟通收费吗，正式项目如何报价？",
    [expectedCandidate(sourceUnits.pricing, 8)],
  ),
  answerCase(
    "zh-contact",
    "zh",
    "怎样联系人工？",
    [expectedCandidate(sourceUnits.contact, 10)],
  ),
  answerCase(
    "zh-embedding",
    "zh",
    "助手可以怎样接入网站？",
    [expectedCandidate(sourceUnits.embedding, 12)],
  ),
  answerCase(
    "zh-languages",
    "zh",
    "助手支持哪些提问语言？",
    [expectedCandidate(sourceUnits.languages, 14)],
  ),
  answerCase(
    "zh-retention",
    "zh",
    "匿名会话默认保留多久？",
    [expectedCandidate(sourceUnits.retention, 16)],
  ),
  answerCase(
    "en-services",
    "en",
    "What services does Northstar Studio provide?",
    [expectedCandidate(sourceUnits.services, 18)],
  ),
  answerCase(
    "en-updates",
    "en",
    "When does a new knowledge revision replace the old one?",
    [expectedCandidate(sourceUnits.updates, 20)],
  ),
];

const refusalQuestions: Array<{
  id: string;
  language: EvaluationLanguage;
  question: string;
}> = [
  {
    id: "zh-refund",
    language: "zh",
    question: "项目是否承诺当天退款？",
  },
  {
    id: "zh-weekend",
    language: "zh",
    question: "周末是否提供 24 小时电话支持？",
  },
  {
    id: "zh-address",
    language: "zh",
    question: "工作室的线下办公地址在哪里？",
  },
  {
    id: "zh-clients",
    language: "zh",
    question: "你们服务过哪些上市公司？",
  },
  {
    id: "zh-discount",
    language: "zh",
    question: "年付可以打几折？",
  },
  {
    id: "zh-stack",
    language: "zh",
    question: "生产环境使用哪家云厂商？",
  },
  {
    id: "zh-sla",
    language: "zh",
    question: "是否承诺 99.99% 可用性？",
  },
  {
    id: "zh-phone",
    language: "zh",
    question: "人工客服电话号码是多少？",
  },
  {
    id: "en-refund",
    language: "en",
    question: "Do you guarantee same-day refunds?",
  },
  {
    id: "en-office",
    language: "en",
    question: "Where is your physical office?",
  },
];

const refusalCases = refusalQuestions.map(
  ({ id, language, question }, index): RetrievalEvaluationCase => ({
    id,
    language,
    question,
    expectation: { type: "refusal" },
    candidates: distractors(index),
  }),
);

export const retrievalEvaluationCases = [
  ...answerableCases,
  ...refusalCases,
];

export async function runRetrievalEvaluation(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<RetrievalEvaluationSummary> {
  const config = readRetrievalConfig(environment);
  const cases: EvaluationCaseResult[] = [];

  for (const evaluationCase of retrievalEvaluationCases) {
    cases.push(await evaluateCase(evaluationCase, config));
  }

  const failures = {
    falseRefusals: countFailure(cases, "false_refusal"),
    falseAnswers: countFailure(cases, "false_answer"),
    unexpectedClarifications: countFailure(
      cases,
      "unexpected_clarification",
    ),
    unsupportedFacts: countFailure(cases, "unsupported_fact"),
    missingCitations: countFailure(cases, "missing_citation"),
    unexpectedCitations: countFailure(cases, "unexpected_citation"),
    languageMismatches: countFailure(cases, "language_mismatch"),
    technicalErrors: countFailure(cases, "technical_error"),
  };
  const correct = cases.filter(({ passed }) => passed).length;

  return {
    config,
    dataset: {
      total: retrievalEvaluationCases.length,
      answerable: answerableCases.length,
      refusal: refusalCases.length,
      languages: {
        zh: retrievalEvaluationCases.filter(({ language }) => language === "zh")
          .length,
        en: retrievalEvaluationCases.filter(({ language }) => language === "en")
          .length,
      },
    },
    outcomes: {
      groundedAnswers: cases.filter(({ actual }) => actual === "answer").length,
      groundedRefusals: cases.filter(({ actual }) => actual === "refusal").length,
      clarifications: cases.filter(
        ({ actual }) => actual === "clarification",
      ).length,
      correct,
      passRate: Number((correct / cases.length).toFixed(4)),
    },
    failures,
    byLanguage: {
      zh: languageSummary(cases, "zh"),
      en: languageSummary(cases, "en"),
    },
    cases,
    passed: Object.values(failures).every((count) => count === 0),
  };
}

async function evaluateCase(
  evaluationCase: RetrievalEvaluationCase,
  config: RetrievalConfig,
): Promise<EvaluationCaseResult> {
  const answerExpectation =
    evaluationCase.expectation.type === "answer"
      ? evaluationCase.expectation
      : null;
  const events: AssistantResponseEvent[] = [];
  let finalEvidence: GroundedEvidence[] = [];

  try {
    for await (const event of streamGroundedAnswer(
      {
        organizationId: ORGANIZATION_ID,
        question: evaluationCase.question,
        assistant: ASSISTANT,
      },
      {
        questionEmbeddingProvider: {
          provider: "offline-evaluation",
          model: "fixed-query",
          async embed() {
            return providerResult([1]);
          },
        },
        candidateRepository: {
          async retrieve(_organizationId, _embedding, limit) {
            return evaluationCase.candidates.slice(0, limit);
          },
        },
        rerankingProvider: {
          provider: "offline-evaluation",
          model: "fixed-reranker",
          async rerank(_question, candidates) {
            const scores = new Map(
              evaluationCase.candidates.map(({ id, rerankScore }) => [
                id,
                rerankScore,
              ]),
            );

            return providerResult(
              candidates
                .map(({ id }) => ({
                  contentUnitId: id,
                  score: scores.get(id) ?? 0,
                }))
                .sort((left, right) => right.score - left.score),
            );
          },
        },
        answerProvider: {
          provider: "offline-evaluation",
          model: "fixed-answer",
          streamAnswer({ evidence }) {
            finalEvidence = evidence;
            const answer =
              answerExpectation
                ? answerExpectation.answerStatements.join(" ")
                : evaluationCase.language === "en"
                  ? "Northstar Studio has confirmed that request."
                  : "北辰工作室已确认可以满足该问题中的要求。";

            return {
              textStream: chunks(answer),
              metadata: Promise.resolve({
                durationMs: 0,
                tokens: {
                  input: 0,
                  output: 0,
                  total: 0,
                },
                traceId: `${evaluationCase.id}-answer`,
              }),
            };
          },
        },
        callLogger: {
          async record() {},
        },
        config,
      },
    )) {
      events.push(event);
    }
  } catch {
    return caseResult(evaluationCase, "technical_error", ["technical_error"]);
  }

  const refusal = events.find(
    (event): event is Extract<AssistantResponseEvent, { type: "refusal" }> =>
      event.type === "refusal",
  );
  if (refusal) {
    const failures: CaseFailure[] =
      answerExpectation ? ["false_refusal"] : [];

    if (!matchesLanguage(refusal.message, evaluationCase.language)) {
      failures.push("language_mismatch");
    }

    return caseResult(
      evaluationCase,
      "refusal",
      failures,
    );
  }

  const clarification = events.find(
    (event): event is Extract<
      AssistantResponseEvent,
      { type: "complete"; resultType: "clarification_request" }
    > =>
      event.type === "complete" &&
      event.resultType === "clarification_request",
  );
  if (clarification) {
    return caseResult(
      evaluationCase,
      "clarification",
      ["unexpected_clarification"],
    );
  }

  const answer = events
    .filter(
      (event): event is Extract<AssistantResponseEvent, { type: "text_delta" }> =>
        event.type === "text_delta",
    )
    .map(({ delta }) => delta)
    .join("");
  const completion = events.find(
    (event): event is Extract<
      AssistantResponseEvent,
      { type: "complete"; resultType: "grounded_answer" }
    > =>
      event.type === "complete" &&
      event.resultType === "grounded_answer",
  );

  if (!completion) {
    return caseResult(evaluationCase, "technical_error", ["technical_error"]);
  }

  const failures: CaseFailure[] = [];
  if (evaluationCase.expectation.type === "refusal") {
    failures.push("false_answer");
  }

  const actualSourceIds = new Set(
    completion.citations.map(({ knowledgeSourceId }) => knowledgeSourceId),
  );
  const expectedSourceIds = new Set(
    answerExpectation?.expectedKnowledgeSourceIds ?? [],
  );

  if (
    expectedSourceIds.size > 0 &&
    [...expectedSourceIds].some((sourceId) => !actualSourceIds.has(sourceId))
  ) {
    failures.push("missing_citation");
  }

  if (
    [...actualSourceIds].some((sourceId) => !expectedSourceIds.has(sourceId))
  ) {
    failures.push("unexpected_citation");
  }

  if (containsUnsupportedFacts(answer, finalEvidence)) {
    failures.push("unsupported_fact");
  }

  if (!matchesLanguage(answer, evaluationCase.language)) {
    failures.push("language_mismatch");
  }

  return caseResult(evaluationCase, "answer", failures);
}

function caseResult(
  evaluationCase: RetrievalEvaluationCase,
  actual: EvaluationCaseResult["actual"],
  failures: CaseFailure[],
): EvaluationCaseResult {
  return {
    id: evaluationCase.id,
    language: evaluationCase.language,
    expected: evaluationCase.expectation.type,
    actual,
    passed: failures.length === 0,
    failures,
  };
}

function containsUnsupportedFacts(
  answer: string,
  evidence: GroundedEvidence[],
) {
  const supportedStatements = new Set(
    evidence.flatMap(({ content }) => statements(content)),
  );

  return statements(answer).some(
    (statement) => !supportedStatements.has(statement),
  );
}

function statements(value: string) {
  return value
    .split(/[。！？.!?]+/u)
    .map((statement) =>
      statement
        .trim()
        .toLocaleLowerCase("en")
        .replaceAll(/\s+/g, " "),
    )
    .filter(Boolean);
}

function languageSummary(
  cases: EvaluationCaseResult[],
  language: EvaluationLanguage,
) {
  const languageCases = cases.filter((item) => item.language === language);
  const correct = languageCases.filter(({ passed }) => passed).length;

  return {
    total: languageCases.length,
    correct,
    contractViolations: languageCases.length - correct,
  };
}

function countFailure(
  cases: EvaluationCaseResult[],
  failure: CaseFailure,
) {
  return cases.filter(({ failures }) => failures.includes(failure)).length;
}

function matchesLanguage(value: string, language: EvaluationLanguage) {
  const containsHan = /\p{Script=Han}/u.test(value);
  return language === "zh"
    ? containsHan
    : !containsHan && /[a-z]{2}/iu.test(value);
}

function answerCase(
  id: string,
  language: EvaluationLanguage,
  question: string,
  expectedCandidates: ExpectedCandidate[],
): RetrievalEvaluationCase {
  const expectedUnits = expectedCandidates.map(({ unit }) => unit);

  return {
    id,
    language,
    question,
    expectation: {
      type: "answer",
      expectedKnowledgeSourceIds: expectedUnits.map(
        ({ knowledgeSourceId }) => knowledgeSourceId,
      ),
      answerStatements: expectedUnits.map(
        ({ answerStatements }) => answerStatements[language],
      ),
    },
    candidates: candidatePool(id, expectedCandidates),
  };
}

function distractors(offset: number) {
  const units = Object.values(sourceUnits);

  return Array.from({ length: 20 }, (_, index) => {
    const unit = units[(offset + index) % units.length]!;
    return rankedCandidate(
      {
        ...unit,
        id: `${unit.id}-refusal-${offset}-${index}`,
      },
      0.49 - (index % 5) * 0.04,
      0.99 - index * 0.01,
    );
  });
}

function candidatePool(
  caseId: string,
  expectedCandidates: ExpectedCandidate[],
) {
  if (
    expectedCandidates.some(
      ({ retrievalRank }) => retrievalRank < 1 || retrievalRank > 20,
    )
  ) {
    throw new Error(`评测题 ${caseId} 的召回名次配置无效`);
  }

  const expectedIds = new Set(
    expectedCandidates.map(({ unit }) => unit.knowledgeSourceId),
  );
  const distractorUnits = Object.values(sourceUnits).filter(
    ({ knowledgeSourceId }) => !expectedIds.has(knowledgeSourceId),
  );
  const expectedByIndex = new Map(
    expectedCandidates.map((candidate) => [
      candidate.retrievalRank - 1,
      candidate,
    ]),
  );
  let distractorIndex = 0;

  return Array.from({ length: 20 }, (_, index) => {
    const expected = expectedByIndex.get(index);
    if (expected) {
      return rankedCandidate(
        expected.unit,
        expected.rerankScore,
        0.99 - index * 0.01,
      );
    }

    const unit = distractorUnits[distractorIndex % distractorUnits.length]!;
    const candidate = rankedCandidate(
      {
        ...unit,
        id: `${unit.id}-${caseId}-distractor-${distractorIndex}`,
      },
      0.49 - (distractorIndex % 5) * 0.04,
      0.99 - index * 0.01,
    );
    distractorIndex += 1;
    return candidate;
  });
}

function expectedCandidate(
  unit: EvaluationContentUnit,
  retrievalRank: number,
  rerankScore = 0.93,
): ExpectedCandidate {
  return {
    unit,
    retrievalRank,
    rerankScore,
  };
}

function contentUnit(
  id: string,
  title: string,
  chineseStatement: string,
  englishStatement: string,
  knowledgeSourceKey = id,
): EvaluationContentUnit {
  return {
    id: `unit-${id}`,
    knowledgeSourceId: `source-${knowledgeSourceKey}`,
    sourceTitle: title,
    sourceUrl: `https://example.test/${knowledgeSourceKey}`,
    heading: title,
    content: `${chineseStatement} ${englishStatement}`,
    similarity: 0,
    answerStatements: {
      zh: chineseStatement,
      en: englishStatement,
    },
  };
}

function rankedCandidate(
  unit: RetrievedContentUnit,
  rerankScore: number,
  similarity: number,
): RankedCandidate {
  return {
    ...unit,
    rerankScore,
    similarity,
  };
}

function providerResult<T>(value: T) {
  return {
    value,
    durationMs: 0,
    tokens: {
      input: 0,
      output: 0,
      total: 0,
    },
    traceId: "offline-evaluation",
  };
}

async function* chunks(value: string) {
  yield value;
}
