import type {
  GroundedAnswerDependencies,
} from "./grounded-answer.ts";
import {
  streamStructuredSectionedAssistantResponse,
  type RequestAnalysisDependencies,
  type StructuredAssistantResponseInput,
} from "./request-analysis.ts";
import type {
  SectionedAssistantResponseEvent,
} from "./response-sections.ts";

export const RESPONSE_DECISION_STRATEGY_VERSION =
  "structured-evidence-v1.25a97ae9422f" as const;

export const DECISION_EVALUATION_DATASET_VERSION =
  "decision-contract-v1" as const;

export const APPROVED_RESPONSE_DECISION_CONTRACT_FINGERPRINT =
  "25a97ae9422fac2562b4d20a5fe7367cbfce4afec1b1921b0d912e1bbc5b38c1" as const;

export const APPROVED_DECISION_EVALUATOR_FINGERPRINT =
  "04b06b2bc049ee768f16794bc40d27e5f9c463bdfa145bbc5cb1872ed3700f8c" as const;

export const responseDecisionRelease = {
  strategyVersion: RESPONSE_DECISION_STRATEGY_VERSION,
  datasetVersion: DECISION_EVALUATION_DATASET_VERSION,
  contractFingerprint:
    APPROVED_RESPONSE_DECISION_CONTRACT_FINGERPRINT,
  evaluatorFingerprint: APPROVED_DECISION_EVALUATOR_FINGERPRINT,
  contract: {
    requestAnalysis: "request-analysis-v1",
    evidenceCoverage: "evidence-coverage-v1",
    responseMapping: "multi-request-decision-v1",
    models: {
      embedding: "BAAI/bge-m3",
      rerank: "BAAI/bge-reranker-v2-m3",
      requestAnalysis: "deepseek-v4-flash",
      evidenceCoverage: "deepseek-v4-flash",
      answer: "deepseek-v4-flash",
    },
    retrieval: {
      candidateLimit: 20,
      evidenceLimit: 5,
      rerankNoiseFloor: 0.05,
    },
  },
  evaluatedAt: "2026-07-31",
  status: "passed",
  safety: {
    unsupportedFacts: 0,
    unverifiableEvidence: 0,
    wrongCitations: 0,
    technicalFailuresAsRefusals: 0,
  },
  comparison: {
    legacyWrongAnswers: 6,
    legacyWrongRefusals: 4,
    newWrongAnswers: 0,
    newWrongRefusals: 0,
  },
} as const;

export const responseDecisionReleaseSymbol: unique symbol =
  Symbol.for("grounded-desk.response-decision-release");

export type ReleasedSectionedAssistantResponseEvent =
  SectionedAssistantResponseEvent & {
    [responseDecisionReleaseSymbol]?:
      typeof RESPONSE_DECISION_STRATEGY_VERSION;
  };

export async function* streamReleasedSectionedAssistantResponse(
  input: StructuredAssistantResponseInput,
  dependencies: {
    requestAnalysis: RequestAnalysisDependencies;
    groundedAnswer: GroundedAnswerDependencies;
  },
): AsyncGenerator<ReleasedSectionedAssistantResponseEvent> {
  assertApprovedRuntime(dependencies);
  yield* attachResponseDecisionRelease(
    streamStructuredSectionedAssistantResponse(
      input,
      dependencies,
    ),
  );
}

export async function* attachResponseDecisionRelease(
  events:
    | Iterable<SectionedAssistantResponseEvent>
    | AsyncIterable<SectionedAssistantResponseEvent>,
): AsyncGenerator<ReleasedSectionedAssistantResponseEvent> {
  for await (const event of events) {
    if (event.type === "message_complete") {
      Object.defineProperty(event, responseDecisionReleaseSymbol, {
        value: RESPONSE_DECISION_STRATEGY_VERSION,
        enumerable: false,
      });
    }
    yield event;
  }
}

function assertApprovedRuntime(dependencies: {
  requestAnalysis: RequestAnalysisDependencies;
  groundedAnswer: GroundedAnswerDependencies;
}) {
  const runtime = {
    models: {
      embedding:
        dependencies.groundedAnswer.questionEmbeddingProvider.model,
      rerank: dependencies.groundedAnswer.rerankingProvider.model,
      requestAnalysis: dependencies.requestAnalysis.provider.model,
      evidenceCoverage:
        dependencies.groundedAnswer.evidenceCoverageProvider.model,
      answer: dependencies.groundedAnswer.answerProvider.model,
    },
    retrieval: dependencies.groundedAnswer.config,
  };

  if (!isApprovedResponseDecisionRuntime(runtime)) {
    throw new Error(
      "响应决策运行配置尚未通过当前策略版本的发布验证",
    );
  }
}

export function isApprovedResponseDecisionRuntime(runtime: {
  models: {
    embedding: string;
    rerank: string;
    requestAnalysis: string;
    evidenceCoverage: string;
    answer: string;
  };
  retrieval: {
    candidateLimit: number;
    evidenceLimit: number;
    rerankNoiseFloor: number;
  };
}) {
  return JSON.stringify(runtime) === JSON.stringify({
    models: responseDecisionRelease.contract.models,
    retrieval: responseDecisionRelease.contract.retrieval,
  });
}
