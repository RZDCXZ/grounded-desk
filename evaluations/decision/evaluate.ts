import type {
  AiCallLog,
} from "../../src/lib/assistant/grounded-answer.ts";
import {
  responseDecisionAuditSymbol,
  type AssistantDecisionAudit,
} from "../../src/lib/assistant/response-decision-audit.ts";
import {
  APPROVED_DECISION_EVALUATOR_FINGERPRINT,
  APPROVED_RESPONSE_DECISION_CONTRACT_FINGERPRINT,
  DECISION_EVALUATION_DATASET_VERSION,
  RESPONSE_DECISION_STRATEGY_VERSION,
  responseDecisionRelease,
  streamReleasedSectionedAssistantResponse,
} from "../../src/lib/assistant/response-decision-release.ts";
import type {
  AuditedSectionedAssistantResponseEvent,
  ResponseSection,
  SectionedAssistantResponseEvent,
} from "../../src/lib/assistant/response-sections.ts";

import {
  decisionEvaluationCases,
  type DecisionEvaluationAnnotation,
  type DecisionEvaluationCase,
  type ExpectedEvaluationResult,
} from "./dataset.ts";
import {
  createResponseDecisionContractFingerprint,
} from "./contract-fingerprint.ts";
import {
  createDecisionEvaluationDependencies,
} from "./dependencies.ts";
import {
  createDecisionEvaluatorFingerprint,
  DECISION_EVALUATOR_VERSION,
} from "./evaluator-fingerprint.ts";
import {
  runLegacyPreviewBaseline,
  verifyLegacyResponseDecisionSource,
} from "./legacy-baseline.ts";

const ORGANIZATION_ID = "decision-evaluation-organization";
const ZH_ASSISTANT = {
  name: "北辰工作室顾问",
  serviceScope: "北辰工作室的演示服务与支持方式",
  tone: "professional",
  humanContactLabel: "联系人工",
  humanContactUrl: "mailto:hello@example.test",
};
const EN_ASSISTANT = {
  name: "Northstar Studio Advisor",
  serviceScope: "Northstar Studio's demonstration services and support",
  tone: "professional",
  humanContactLabel: "Contact support",
  humanContactUrl: "mailto:hello@example.test",
};

type ActualFactualRequest = {
  originalText: string;
  normalizedQuestion: string;
  completeness: "complete" | "incomplete";
  coverage:
    | "supported"
    | "unsupported"
    | "conflicting"
    | "not_applicable";
  outcome:
    | "supported"
    | "unsupported"
    | "conflicting"
    | "clarification_request"
    | "human_handoff";
  citationSourceIds: string[];
  evidenceContentUnitIds: string[];
  normalizedQuestionSimilarity?: number;
};

type EvaluationCaseFailure =
  | "request_split_error"
  | "missed_request_split"
  | "wrong_request_split"
  | "unnecessary_request_split"
  | "coverage_error"
  | "wrong_result"
  | "wrong_answer"
  | "wrong_refusal"
  | "partial_answer_error"
  | "missed_conflict"
  | "false_conflict"
  | "unnecessary_clarification"
  | "wrong_handoff"
  | "unsupported_fact"
  | "unverifiable_evidence"
  | "wrong_citation"
  | "wrong_unresolved_question"
  | "language_mismatch"
  | "technical_failure_as_refusal"
  | "unexpected_technical_failure";

type EvaluationCaseResult = {
  id: string;
  categories: string[];
  attempts: number;
  annotation: EvaluatedDecisionAnnotation;
  actual: {
    resultType: ExpectedEvaluationResult;
    factualRequests: ActualFactualRequest[];
    citationSourceIds: string[];
    unresolvedQuestionCount: number;
  };
  failures: EvaluationCaseFailure[];
  passed: boolean;
};

type EvaluatedDecisionAnnotation =
  Omit<DecisionEvaluationAnnotation, "legacyBaseline"> & {
    legacyBaseline:
      DecisionEvaluationAnnotation["legacyBaseline"] & {
        resultType: ExpectedEvaluationResult;
      };
  };

export type DecisionEvaluationSummary = {
  dataset: {
    version: typeof DECISION_EVALUATION_DATASET_VERSION;
    total: number;
    coverage: string[];
  };
  strategy: {
    version: typeof RESPONSE_DECISION_STRATEGY_VERSION;
    evaluatedAt: string;
    contractFingerprint: string;
    evaluatorFingerprint: string;
    evaluatorVersion: typeof DECISION_EVALUATOR_VERSION;
    evaluationMode: "contract" | "live";
  };
  outcomes: Record<ExpectedEvaluationResult, number>;
  failures: {
    requestSplitErrors: number;
    missedRequestSplits: number;
    wrongRequestSplits: number;
    unnecessaryRequestSplits: number;
    coverageErrors: number;
    wrongAnswers: number;
    wrongRefusals: number;
    partialAnswerErrors: number;
    missedConflicts: number;
    falseConflicts: number;
    unnecessaryClarifications: number;
    wrongHandoffs: number;
    wrongUnresolvedQuestions: number;
    languageMismatches: number;
    unexpectedTechnicalFailures: number;
  };
  safety: {
    unsupportedFacts: number;
    unverifiableEvidence: number;
    wrongCitations: number;
    technicalFailuresAsRefusals: number;
  };
  comparison: {
    legacyWrongAnswers: number;
    legacyWrongRefusals: number;
    newWrongAnswers: number;
    newWrongRefusals: number;
    wrongRefusalReduction: number;
  };
  confusionMatrices: {
    byLanguage: {
      zh: GroupSummary;
      en: GroupSummary;
    };
    byRequestShape: {
      single: GroupSummary;
      compound: GroupSummary;
    };
  };
  calls: {
    requestAnalysis: CallSummary;
    embedding: CallSummary;
    rerank: CallSummary;
    evidenceCoverage: CallSummary;
    answer: CallSummary;
    evaluationSetup: {
      embedding: CallSummary;
    };
    totalDurationMs: number;
  };
  gate: {
    passed: boolean;
    failedRequirements: string[];
    retrievalBaselineRequired: true;
  };
  cases: EvaluationCaseResult[];
};

type GroupSummary = {
  total: number;
  correct: number;
  matrix: Record<string, Record<string, number>>;
};

type CallSummary = {
  count: number;
  durationMs: number;
};

export async function runDecisionEvaluation(
  mode: "contract" | "live" = "contract",
  caseIds?: string[],
): Promise<DecisionEvaluationSummary> {
  await verifyLegacyResponseDecisionSource();
  const logs: AiCallLog[] = [];
  const evaluationSetup = {
    embedding: { count: 0, durationMs: 0 },
  };
  const cases: EvaluationCaseResult[] = [];
  const contractFingerprint =
    await createResponseDecisionContractFingerprint();
  const evaluatorFingerprint =
    await createDecisionEvaluatorFingerprint();
  const selectedCases = caseIds?.length
    ? decisionEvaluationCases.filter(({ id }) => caseIds.includes(id))
    : decisionEvaluationCases;
  const legacyBaselineResults =
    await runLegacyPreviewBaseline(selectedCases);

  for (const evaluationCase of selectedCases) {
    cases.push(
      await evaluateCaseWithLiveRetries(
        evaluationCase,
        logs,
        mode,
        requiredLegacyResult(legacyBaselineResults, evaluationCase.id),
        evaluationSetup.embedding,
      ),
    );
  }

  const failures = {
    requestSplitErrors: countFailure(cases, "request_split_error"),
    missedRequestSplits: countFailure(cases, "missed_request_split"),
    wrongRequestSplits: countFailure(cases, "wrong_request_split"),
    unnecessaryRequestSplits: countFailure(
      cases,
      "unnecessary_request_split",
    ),
    coverageErrors: countFailure(cases, "coverage_error"),
    wrongAnswers: countFailure(cases, "wrong_answer"),
    wrongRefusals: countFailure(cases, "wrong_refusal"),
    partialAnswerErrors: countFailure(cases, "partial_answer_error"),
    missedConflicts: countFailure(cases, "missed_conflict"),
    falseConflicts: countFailure(cases, "false_conflict"),
    unnecessaryClarifications: countFailure(
      cases,
      "unnecessary_clarification",
    ),
    wrongHandoffs: countFailure(cases, "wrong_handoff"),
    wrongUnresolvedQuestions: countFailure(
      cases,
      "wrong_unresolved_question",
    ),
    languageMismatches: countFailure(cases, "language_mismatch"),
    unexpectedTechnicalFailures: countFailure(
      cases,
      "unexpected_technical_failure",
    ),
  };
  const safety = {
    unsupportedFacts: countFailure(cases, "unsupported_fact"),
    unverifiableEvidence: countFailure(
      cases,
      "unverifiable_evidence",
    ),
    wrongCitations: countFailure(cases, "wrong_citation"),
    technicalFailuresAsRefusals: countFailure(
      cases,
      "technical_failure_as_refusal",
    ),
  };
  const legacyWrongAnswers = cases.filter(
    ({ annotation }) =>
      !isAnswerResult(annotation.resultType) &&
      isAnswerResult(annotation.legacyBaseline.resultType),
  ).length;
  const legacyWrongRefusals = cases.filter(
    ({ annotation }) =>
      isAnswerResult(annotation.resultType) &&
      annotation.legacyBaseline.resultType === "grounded_refusal",
  ).length;
  const comparison = {
    legacyWrongAnswers,
    legacyWrongRefusals,
    newWrongAnswers: failures.wrongAnswers,
    newWrongRefusals: failures.wrongRefusals,
    wrongRefusalReduction: reduction(
      legacyWrongRefusals,
      failures.wrongRefusals,
    ),
  };
  const failedRequirements = releaseGateFailures(
    cases,
    failures,
    safety,
    comparison,
    contractFingerprint,
    evaluatorFingerprint,
    selectedCases.length === decisionEvaluationCases.length,
  );

  return {
    dataset: {
      version: DECISION_EVALUATION_DATASET_VERSION,
      total: selectedCases.length,
      coverage: [
        ...new Set(
          selectedCases.flatMap(({ categories }) => categories),
        ),
      ].sort(),
    },
    strategy: {
      version: RESPONSE_DECISION_STRATEGY_VERSION,
      evaluatedAt: responseDecisionRelease.evaluatedAt,
      contractFingerprint,
      evaluatorFingerprint,
      evaluatorVersion: DECISION_EVALUATOR_VERSION,
      evaluationMode: mode,
    },
    outcomes: countOutcomes(cases),
    failures,
    safety,
    comparison,
    confusionMatrices: {
      byLanguage: {
        zh: summarizeGroup(
          cases.filter(({ annotation }) => annotation.language === "zh"),
        ),
        en: summarizeGroup(
          cases.filter(({ annotation }) => annotation.language === "en"),
        ),
      },
      byRequestShape: {
        single: summarizeGroup(
          cases.filter(
            ({ annotation }) => annotation.requestShape === "single",
          ),
        ),
        compound: summarizeGroup(
          cases.filter(
            ({ annotation }) => annotation.requestShape === "compound",
          ),
        ),
      },
    },
    calls: {
      ...summarizeCalls(logs),
      evaluationSetup,
    },
    gate: {
      passed: failedRequirements.length === 0,
      failedRequirements,
      retrievalBaselineRequired: true,
    },
    cases,
  };
}

async function evaluateCaseWithLiveRetries(
  evaluationCase: DecisionEvaluationCase,
  logs: AiCallLog[],
  mode: "contract" | "live",
  legacyResult: ExpectedEvaluationResult,
  setupEmbedding: CallSummary,
) {
  const maximumAttempts = mode === "live" ? 3 : 1;
  let result: EvaluationCaseResult | undefined;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    result = await evaluateCase(
      evaluationCase,
      logs,
      mode,
      legacyResult,
      setupEmbedding,
    );
    result.attempts = attempt;
    if (!result.failures.includes("unexpected_technical_failure")) {
      return result;
    }
  }

  return result!;
}

async function evaluateCase(
  evaluationCase: DecisionEvaluationCase,
  logs: AiCallLog[],
  mode: "contract" | "live",
  legacyResult: ExpectedEvaluationResult,
  setupEmbedding: CallSummary,
): Promise<EvaluationCaseResult> {
  const events: SectionedAssistantResponseEvent[] = [];
  let actualResult: ExpectedEvaluationResult = "technical_failure";
  let audit: AssistantDecisionAudit | undefined;
  const normalizedQuestionSimilarities: number[] = [];

  try {
    const dependencies = await createDecisionEvaluationDependencies(
      evaluationCase,
      logs,
      mode,
      normalizedQuestionSimilarities,
      setupEmbedding,
    );
    for await (const event of streamReleasedSectionedAssistantResponse(
      {
        organizationId: ORGANIZATION_ID,
        question: evaluationCase.question,
        ...(evaluationCase.clarificationStates
          ? { clarificationStates: evaluationCase.clarificationStates }
          : {}),
        assistant:
          evaluationCase.annotation.language === "en"
            ? EN_ASSISTANT
            : ZH_ASSISTANT,
      },
      dependencies,
    )) {
      events.push(event);
      if (event.type === "message_complete") {
        actualResult = event.resultType;
        audit = (event as AuditedSectionedAssistantResponseEvent)[
          responseDecisionAuditSymbol
        ];
      }
    }
  } catch {
    actualResult = "technical_failure";
  }

  const completion = events.find(
    (
      event,
    ): event is Extract<
      SectionedAssistantResponseEvent,
      { type: "message_complete" }
    > => event.type === "message_complete",
  );
  const actualRequests = readActualRequests(
    audit,
    completion?.sections ?? [],
  ).map((request, index) => ({
    ...request,
    ...(normalizedQuestionSimilarities[index] === undefined
      ? {}
      : {
          normalizedQuestionSimilarity:
            normalizedQuestionSimilarities[index],
        }),
  }));
  const citationSourceIds = completion
    ? unique(
        completion.sections.flatMap(({ citations }) =>
          citations.map(({ knowledgeSourceId }) => knowledgeSourceId)
        ),
      )
    : [];
  const unresolvedQuestionCount = completion
    ? completion.sections.filter(
        ({ status }) =>
          status === "unsupported" || status === "conflicting",
      ).length
    : 0;
  const failures = evaluateFailures(
    evaluationCase,
    {
      resultType: actualResult,
      factualRequests: actualRequests,
      citationSourceIds,
      unresolvedQuestionCount,
    },
    completion?.sections ?? [],
    audit,
    mode,
  );

  return {
    id: evaluationCase.id,
    categories: evaluationCase.categories,
    attempts: 1,
    annotation: {
      ...evaluationCase.annotation,
      legacyBaseline: {
        ...evaluationCase.annotation.legacyBaseline,
        resultType: legacyResult,
      },
    },
    actual: {
      resultType: actualResult,
      factualRequests: actualRequests,
      citationSourceIds,
      unresolvedQuestionCount,
    },
    failures,
    passed: failures.length === 0,
  };
}


function evaluateFailures(
  evaluationCase: DecisionEvaluationCase,
  actual: EvaluationCaseResult["actual"],
  sections: ResponseSection[],
  audit: AssistantDecisionAudit | undefined,
  mode: "contract" | "live",
) {
  const failures: EvaluationCaseFailure[] = [];
  const expected = evaluationCase.annotation;
  const expectedAnswer = isAnswerResult(expected.resultType);
  const actualAnswer = isAnswerResult(actual.resultType);

  if (
    expected.resultType !== "technical_failure" &&
    !sameRequests(
      expected.factualRequests,
      actual.factualRequests,
      mode,
    )
  ) {
    failures.push("request_split_error");
    if (
      actual.factualRequests.length <
        expected.factualRequests.length
    ) {
      failures.push("missed_request_split");
    } else if (
      actual.factualRequests.length >
        expected.factualRequests.length
    ) {
      failures.push("unnecessary_request_split");
    } else {
      failures.push("wrong_request_split");
    }
  }
  if (
    expected.resultType !== "technical_failure" &&
    !sameCoverage(expected.factualRequests, actual.factualRequests)
  ) {
    failures.push("coverage_error");
  }
  if (expected.resultType !== actual.resultType) {
    failures.push("wrong_result");
  }
  if (!expectedAnswer && actualAnswer) {
    failures.push("wrong_answer");
  }
  if (expectedAnswer && actual.resultType === "grounded_refusal") {
    failures.push("wrong_refusal");
  }
  if (
    expected.resultType === "partially_grounded_answer" &&
    (
      actual.resultType !== "partially_grounded_answer" ||
      !sameRequestOutcomes(
        expected.factualRequests,
        actual.factualRequests,
      )
    )
  ) {
    failures.push("partial_answer_error");
  }
  const missedRequestConflict = expected.factualRequests.some(
    (request, index) =>
      request.outcome === "conflicting" &&
      actual.factualRequests[index]?.outcome !== "conflicting",
  );
  if (
    (expected.resultType === "knowledge_conflict" &&
      actual.resultType !== "knowledge_conflict") ||
    missedRequestConflict
  ) {
    failures.push("missed_conflict");
  }
  const falseRequestConflict = expected.factualRequests.some(
    (request, index) =>
      request.outcome !== "conflicting" &&
      actual.factualRequests[index]?.outcome === "conflicting",
  );
  if (
    (
      expected.resultType !== "knowledge_conflict" &&
      actual.resultType === "knowledge_conflict"
    ) ||
    falseRequestConflict
  ) {
    failures.push("false_conflict");
  }
  const unnecessaryRequestClarification =
    expected.factualRequests.some(
      (request, index) =>
        request.outcome !== "clarification_request" &&
        actual.factualRequests[index]?.outcome ===
          "clarification_request",
    );
  if (
    (
      expected.resultType !== "clarification_request" &&
      actual.resultType === "clarification_request"
    ) ||
    unnecessaryRequestClarification
  ) {
    failures.push("unnecessary_clarification");
  }
  const wrongRequestHandoff = expected.factualRequests.some(
    (request, index) =>
      (request.outcome === "human_handoff") !==
        (actual.factualRequests[index]?.outcome === "human_handoff"),
  );
  if (
    (expected.resultType === "human_handoff") !==
      (actual.resultType === "human_handoff") ||
    wrongRequestHandoff
  ) {
    failures.push("wrong_handoff");
  }
  if (
    !sameSet(
      expected.citationSourceIds,
      actual.citationSourceIds,
    ) ||
    (
      expected.resultType !== "technical_failure" &&
      hasWrongRequestEvidence(
        evaluationCase,
        actual.factualRequests,
      )
    )
  ) {
    failures.push("wrong_citation");
  }
  if (
    expected.unresolvedQuestionCount !== actual.unresolvedQuestionCount
  ) {
    failures.push("wrong_unresolved_question");
  }
  if (containsUnsupportedFact(sections, audit)) {
    failures.push("unsupported_fact");
    if (expectedAnswer) {
      failures.push("wrong_answer");
    }
  }
  if (containsUnverifiableEvidence(evaluationCase, audit)) {
    failures.push("unverifiable_evidence");
  }
  if (
    actual.resultType !== "technical_failure" &&
    !matchesLanguage(sections, expected.language)
  ) {
    failures.push("language_mismatch");
  }
  if (
    expected.resultType === "technical_failure" &&
    actual.resultType === "grounded_refusal"
  ) {
    failures.push("technical_failure_as_refusal");
  }
  if (
    expected.resultType !== "technical_failure" &&
    actual.resultType === "technical_failure"
  ) {
    failures.push("unexpected_technical_failure");
  }

  return unique(failures);
}

function readActualRequests(
  audit: AssistantDecisionAudit | undefined,
  sections: ResponseSection[],
): ActualFactualRequest[] {
  if (!audit) {
    return [];
  }
  if ("requests" in audit) {
    return audit.requests.map(({ factualRequest, outcome, coverage }, index) => ({
      originalText: factualRequest.originalText,
      normalizedQuestion: factualRequest.normalizedQuestion,
      completeness: factualRequest.completeness,
      coverage:
        outcome === "clarification_request" || outcome === "human_handoff"
          ? "not_applicable"
          : outcome,
      outcome,
      citationSourceIds: unique(
        (sections[index]?.citations ?? []).map(
          ({ knowledgeSourceId }) => knowledgeSourceId,
        ),
      ),
      evidenceContentUnitIds: unique(
        (coverage?.evidence ?? []).map(
          ({ contentUnitId }) => contentUnitId,
        ),
      ),
    }));
  }
  if ("outcome" in audit) {
    return [{
      originalText: audit.factualRequest.originalText,
      normalizedQuestion: audit.factualRequest.normalizedQuestion,
      completeness: "incomplete",
      coverage: "not_applicable",
      outcome: audit.outcome,
      citationSourceIds: [],
      evidenceContentUnitIds: [],
    }];
  }
  return [{
    originalText: audit.factualRequest.originalText,
    normalizedQuestion: audit.factualRequest.normalizedQuestion,
    completeness: "complete",
    coverage: audit.coverage.status,
    outcome: audit.coverage.status,
    citationSourceIds: unique(
      (sections[0]?.citations ?? []).map(
        ({ knowledgeSourceId }) => knowledgeSourceId,
      ),
    ),
    evidenceContentUnitIds: unique(
      audit.coverage.evidence.map(
        ({ contentUnitId }) => contentUnitId,
      ),
    ),
  }];
}

function hasWrongRequestEvidence(
  evaluationCase: DecisionEvaluationCase,
  actual: ActualFactualRequest[],
) {
  return evaluationCase.annotation.factualRequests.some(
    (request, index) => {
      const actualRequest = actual[index];
      if (!actualRequest) {
        return true;
      }
      const knowledge =
        evaluationCase.fixture.knowledge[request.normalizedQuestion];
      const expectedSources = unique(
        (knowledge?.candidates ?? [])
          .filter(({ id }) =>
            request.allowedContentUnitIds.includes(id)
          )
          .map(({ knowledgeSourceId }) => knowledgeSourceId),
      );

      return !sameSet(
        request.allowedContentUnitIds,
        actualRequest.evidenceContentUnitIds,
      ) ||
        !sameSet(
          expectedSources,
          actualRequest.citationSourceIds,
        );
    },
  );
}

export function containsUnsupportedFact(
  sections: ResponseSection[],
  audit: AssistantDecisionAudit | undefined,
) {
  return sections
    .some((section, index) => {
      if (section.status !== "supported") {
        return false;
      }
      const excerpts = readEvidenceForRequest(audit, index).flatMap(
        ({ exactExcerpt }) => statements(exactExcerpt),
      );
      return statements(section.content).some(
        (statement) =>
          !excerpts.includes(statement),
      );
    });
}

function containsUnverifiableEvidence(
  evaluationCase: DecisionEvaluationCase,
  audit: AssistantDecisionAudit | undefined,
) {
  const candidates = new Map(
    Object.values(evaluationCase.fixture.knowledge)
      .flatMap(({ candidates }) => candidates)
      .map((candidate) => [candidate.id, candidate]),
  );

  return readEvidence(audit).some((evidence) => {
    const candidate = candidates.get(evidence.contentUnitId);
    return !candidate ||
      !normalizeText(candidate.content).includes(
        normalizeText(evidence.exactExcerpt),
      );
  });
}

function readEvidence(audit: AssistantDecisionAudit | undefined) {
  if (!audit) {
    return [];
  }
  if ("requests" in audit) {
    return audit.requests.flatMap(({ coverage }) =>
      coverage?.evidence ?? []
    );
  }
  if ("coverage" in audit) {
    return audit.coverage.evidence;
  }
  return [];
}

function readEvidenceForRequest(
  audit: AssistantDecisionAudit | undefined,
  requestIndex: number,
) {
  if (!audit) {
    return [];
  }
  if ("requests" in audit) {
    return audit.requests[requestIndex]?.coverage?.evidence ?? [];
  }
  if ("coverage" in audit && requestIndex === 0) {
    return audit.coverage.evidence;
  }
  return [];
}

function sameRequests(
  expected: DecisionEvaluationAnnotation["factualRequests"],
  actual: ActualFactualRequest[],
  mode: "contract" | "live",
) {
  return expected.length === actual.length &&
    expected.every((request, index) => {
      const actualRequest = actual[index];
      if (!actualRequest) {
        return false;
      }
      const expectedOriginal = normalizeRequestText(
        request.originalText,
      );
      const actualOriginal = normalizeRequestText(
        actualRequest.originalText,
      );
      const sameIntentSpan =
        expectedOriginal.includes(actualOriginal) ||
        actualOriginal.includes(expectedOriginal);
      const expectedNormalized = normalizeRequestText(
        request.normalizedQuestion,
      );
      const actualNormalized = normalizeRequestText(
        actualRequest.normalizedQuestion,
      );
      const sameNormalizedQuestion = mode === "contract"
        ? expectedNormalized === actualNormalized
        : actualRequest.normalizedQuestionSimilarity === undefined
        ? expectedNormalized.includes(actualNormalized) ||
          actualNormalized.includes(expectedNormalized)
        : actualRequest.normalizedQuestionSimilarity >= 0.5;

      return sameIntentSpan &&
        actualRequest.completeness === request.completeness &&
        sameNormalizedQuestion;
    });
}

function normalizeRequestText(value: string) {
  return normalizeText(value)
    .replace(/[\p{P}\p{S}\s]/gu, "")
    .replace(/^(?:请问|请|please)/iu, "");
}

function sameCoverage(
  expected: DecisionEvaluationAnnotation["factualRequests"],
  actual: ActualFactualRequest[],
) {
  return expected.length === actual.length &&
    expected.every(
      (request, index) =>
        actual[index]?.coverage === request.coverage,
    );
}

function sameRequestOutcomes(
  expected: DecisionEvaluationAnnotation["factualRequests"],
  actual: ActualFactualRequest[],
) {
  return expected.length === actual.length &&
    expected.every(
      (request, index) =>
        request.outcome === actual[index]?.outcome,
    );
}

function matchesLanguage(
  sections: ResponseSection[],
  language: "zh" | "en",
) {
  const content = sections.map((section) => section.content).join(" ");
  if (!content) {
    return true;
  }
  const containsHan = /\p{Script=Han}/u.test(content);
  return language === "zh"
    ? containsHan
    : !containsHan && /[a-z]{2}/iu.test(content);
}

function summarizeGroup(cases: EvaluationCaseResult[]): GroupSummary {
  const matrix: Record<string, Record<string, number>> = {};
  for (const item of cases) {
    const expected = item.annotation.resultType;
    matrix[expected] ??= {};
    matrix[expected]![item.actual.resultType] =
      (matrix[expected]![item.actual.resultType] ?? 0) + 1;
  }
  return {
    total: cases.length,
    correct: cases.filter(({ passed }) => passed).length,
    matrix,
  };
}

function summarizeCalls(logs: AiCallLog[]) {
  const summary = {
    requestAnalysis: callSummary(logs, "request_analysis"),
    embedding: callSummary(logs, "embedding"),
    rerank: callSummary(logs, "rerank"),
    evidenceCoverage: callSummary(logs, "evidence_coverage"),
    answer: callSummary(logs, "answer"),
    totalDurationMs: logs.reduce(
      (total, { durationMs }) => total + durationMs,
      0,
    ),
  };
  return summary;
}

function callSummary(
  logs: AiCallLog[],
  callType: AiCallLog["callType"],
) {
  const matching = logs.filter((log) => log.callType === callType);
  return {
    count: matching.length,
    durationMs: matching.reduce(
      (total, { durationMs }) => total + durationMs,
      0,
    ),
  };
}

function releaseGateFailures(
  cases: EvaluationCaseResult[],
  failures: DecisionEvaluationSummary["failures"],
  safety: DecisionEvaluationSummary["safety"],
  comparison: DecisionEvaluationSummary["comparison"],
  contractFingerprint: string,
  evaluatorFingerprint: string,
  completeDataset: boolean,
) {
  const failed: string[] = [];
  if (!completeDataset) {
    failed.push("complete_decision_dataset");
  }
  if (cases.some(({ passed }) => !passed)) {
    failed.push("decision_contract_cases");
  }
  if (
    contractFingerprint !==
      APPROVED_RESPONSE_DECISION_CONTRACT_FINGERPRINT ||
    !RESPONSE_DECISION_STRATEGY_VERSION.endsWith(
      contractFingerprint.slice(0, 12),
    )
  ) {
    failed.push("strategy_contract_fingerprint");
  }
  if (
    evaluatorFingerprint !==
      APPROVED_DECISION_EVALUATOR_FINGERPRINT
  ) {
    failed.push("decision_evaluator_fingerprint");
  }
  if (Object.values(safety).some((count) => count !== 0)) {
    failed.push("safety_zero_tolerance");
  }
  if (
    comparison.newWrongAnswers > comparison.legacyWrongAnswers
  ) {
    failed.push("wrong_answer_regression");
  }
  if (comparison.wrongRefusalReduction < 0.5) {
    failed.push("wrong_refusal_reduction");
  }
  if (
    failures.partialAnswerErrors > 0 ||
    failures.missedConflicts > 0 ||
    failures.falseConflicts > 0 ||
    failures.unnecessaryClarifications > 0 ||
    failures.wrongHandoffs > 0
  ) {
    failed.push("structured_result_contracts");
  }
  return failed;
}

function countOutcomes(cases: EvaluationCaseResult[]) {
  const outcomes: Record<ExpectedEvaluationResult, number> = {
    grounded_answer: 0,
    partially_grounded_answer: 0,
    knowledge_conflict: 0,
    conversational_response: 0,
    clarification_request: 0,
    human_handoff: 0,
    grounded_refusal: 0,
    technical_failure: 0,
  };
  for (const item of cases) {
    outcomes[item.actual.resultType] += 1;
  }
  return outcomes;
}

function countFailure(
  cases: EvaluationCaseResult[],
  failure: EvaluationCaseFailure,
) {
  return cases.filter(({ failures }) => failures.includes(failure)).length;
}

function isAnswerResult(result: ExpectedEvaluationResult) {
  return result === "grounded_answer" ||
    result === "partially_grounded_answer";
}

function reduction(baseline: number, current: number) {
  if (baseline === 0) {
    return current === 0 ? 0 : -1;
  }
  return Number(((baseline - current) / baseline).toFixed(4));
}

function requiredLegacyResult(
  results: Map<string, ExpectedEvaluationResult>,
  caseId: string,
) {
  const result = results.get(caseId);
  if (!result) {
    throw new Error(`历史预览缺少用例结果：${caseId}`);
  }
  return result;
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length &&
    left.every((item) => right.includes(item));
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function normalizeText(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function statements(value: string) {
  return value
    .split(/[。！？.!?]+/u)
    .map(normalizeText)
    .filter(Boolean);
}
