import {
  ProviderCallError,
  type ProviderCallMetadata,
  type ProviderCallResult,
  type ProviderErrorType,
} from "../ai/provider-call.ts";
import type { ConversationResultType } from "./conversation-result.ts";
import {
  decideEvidenceCoverage,
  type EvidenceCoverageDecision,
} from "./evidence-coverage.ts";
import { detectQuestionLanguage } from "./question-language.ts";
import {
  responseDecisionAuditSymbol,
  type AssistantDecisionAudit,
  type AuditedFactualRequest,
  type ResponseDecisionAudit,
} from "./response-decision-audit.ts";

export { ProviderCallError } from "../ai/provider-call.ts";
export type { ResponseDecisionAudit } from "./response-decision-audit.ts";

export type RetrievedContentUnit = {
  id: string;
  organizationId: string;
  knowledgeSourceId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  heading: string | null;
  content: string;
  similarity: number;
};

export type GroundedEvidence = RetrievedContentUnit & {
  rerankScore: number;
  contentUnitId: string;
};

export type VerifiedAnswerEvidence = {
  contentUnitId: string;
  exactExcerpt: string;
};

export type GroundedCitation = {
  knowledgeSourceId: string;
  contentUnitId?: string;
  title: string;
  url: string | null;
  exactExcerpt?: string;
};

export type ConversationContextMessage = {
  role: "visitor" | "assistant";
  content: string;
  resultType?: ConversationResultType | null;
};

export type GroundedAnswerEvent =
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "refusal";
      resultType: "grounded_refusal";
      message: string;
      contact: {
        label: string;
        url: string;
      };
    }
  | {
      type: "complete";
      resultType: "grounded_answer" | "knowledge_conflict";
      citations: GroundedCitation[];
    };

export type AssistantResponseEvent =
  | GroundedAnswerEvent
  | {
      type: "complete";
      resultType:
        | "conversational_response"
        | "clarification_request";
      citations: [];
    }
  | {
      type: "complete";
      resultType: "human_handoff";
      citations: [];
      contact: {
        label: string;
        url: string;
      };
    };

export type AiCallLog = {
  organizationId: string;
  factualRequestId?: string;
  callType:
    | "request_analysis"
    | "evidence_coverage"
    | "embedding"
    | "rerank"
    | "answer";
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  outcome: "success" | "error";
  errorType: ProviderErrorType | null;
  traceId: string;
};

type ProviderIdentity = {
  provider: string;
  model: string;
};

export type GroundedAnswerDependencies = {
  questionEmbeddingProvider: ProviderIdentity & {
    embed(question: string): Promise<ProviderCallResult<number[]>>;
  };
  candidateRepository: {
    retrieve(
      organizationId: string,
      embedding: number[],
      limit: number,
    ): Promise<RetrievedContentUnit[]>;
  };
  rerankingProvider: ProviderIdentity & {
    rerank(
      question: string,
      candidates: RetrievedContentUnit[],
    ): Promise<
      ProviderCallResult<
        Array<{
          contentUnitId: string;
          score: number;
        }>
      >
    >;
  };
  evidenceCoverageProvider: ProviderIdentity & {
    decide(input: {
      organizationId: string;
      factualRequestId: string;
      normalizedQuestion: string;
      candidates: GroundedEvidence[];
    }): Promise<ProviderCallResult<unknown>>;
  };
  answerProvider: ProviderIdentity & {
    streamAnswer(input: {
      question: string;
      context: ConversationContextMessage[];
      assistant: GroundedAnswerInput["assistant"];
      evidence: VerifiedAnswerEvidence[];
    }): {
      textStream: AsyncIterable<string>;
      metadata: Promise<ProviderCallMetadata>;
    };
  };
  callLogger: {
    record(log: AiCallLog): Promise<void>;
  };
  rateLimitRetry?: {
    delayMs: number;
    wait(delayMs: number): Promise<void>;
  };
  config: {
    candidateLimit: number;
    evidenceLimit: number;
    rerankNoiseFloor: number;
  };
};

export type GroundedAnswerInput = {
  organizationId: string;
  question: string;
  factualRequest?: AuditedFactualRequest;
  context?: ConversationContextMessage[];
  assistant: {
    name: string;
    serviceScope: string;
    tone: string;
    humanContactLabel: string;
    humanContactUrl: string;
  };
};

export async function* streamGroundedAnswer(
  input: GroundedAnswerInput,
  dependencies: GroundedAnswerDependencies,
): AsyncGenerator<AssistantResponseEvent> {
  const context = input.context ?? [];
  const factualRequest = input.factualRequest ?? {
    id: crypto.randomUUID(),
    originalText: input.question,
    normalizedQuestion: input.question,
    requestAnalysisVersion: "legacy-single-request",
  };
  const retrievalQuestion = createRetrievalQuestion(
    input.question,
    context,
  );
  const embeddingResult = await runLoggedProviderCall(
    input.organizationId,
    "embedding",
    dependencies.questionEmbeddingProvider,
    dependencies.callLogger,
    () => dependencies.questionEmbeddingProvider.embed(retrievalQuestion),
    dependencies.rateLimitRetry,
    factualRequest.id,
  );

  const candidates = await dependencies.candidateRepository.retrieve(
    input.organizationId,
    embeddingResult.value,
    dependencies.config.candidateLimit,
  );
  const rerankingResult = candidates.length === 0
    ? null
    : await runLoggedProviderCall(
        input.organizationId,
        "rerank",
        dependencies.rerankingProvider,
        dependencies.callLogger,
        () => dependencies.rerankingProvider.rerank(
          retrievalQuestion,
          candidates,
        ),
        dependencies.rateLimitRetry,
        factualRequest.id,
      );

  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const coverageCandidates = (rerankingResult?.value ?? [])
    .toSorted((left, right) => right.score - left.score)
    .filter(({ score }) => score >= dependencies.config.rerankNoiseFloor)
    .slice(0, dependencies.config.evidenceLimit)
    .flatMap(({ contentUnitId, score }) => {
      const candidate = candidatesById.get(contentUnitId);

      return candidate
        ? [
            {
              ...candidate,
              contentUnitId,
              rerankScore: score,
            },
          ]
        : [];
    });

  const coverageDecision = await decideEvidenceCoverage(
    {
      organizationId: input.organizationId,
      factualRequestId: factualRequest.id,
      normalizedQuestion: factualRequest.normalizedQuestion,
      candidates: coverageCandidates,
    },
    {
      provider: dependencies.evidenceCoverageProvider,
      callLogger: dependencies.callLogger,
    },
  );

  if (coverageDecision.status === "unsupported") {
    yield maybeAttachResponseDecisionAudit(
      createGroundedRefusal(input.assistant, input.question),
      input.factualRequest,
      coverageDecision,
    );
    return;
  }
  if (coverageDecision.status === "conflicting") {
    yield {
      type: "text_delta",
      delta: detectQuestionLanguage(input.question) === "en"
        ? "The available knowledge contains mutually incompatible information for this question, so I cannot provide a single conclusion."
        : "现有知识对这个问题提供了无法同时成立的信息，目前无法给出唯一结论。",
    };
    yield maybeAttachResponseDecisionAudit(
      {
        type: "complete",
        resultType: "knowledge_conflict",
        citations: coverageDecision.evidence.map((relationship) => ({
          knowledgeSourceId: relationship.knowledgeSourceId,
          contentUnitId: relationship.contentUnitId,
          title: relationship.sourceTitle,
          url: normalizeCitationUrl(relationship.sourceUrl),
          exactExcerpt: relationship.exactExcerpt,
        })),
      },
      input.factualRequest,
      coverageDecision,
    );
    return;
  }

  const coverageCandidatesById = new Map(
    coverageCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const evidence = coverageDecision.evidence.flatMap((relationship) => {
    const candidate = coverageCandidatesById.get(
      relationship.contentUnitId,
    );

    return candidate
      ? [{
          ...candidate,
          content: relationship.exactExcerpt,
        }]
      : [];
  });

  let answerCompleted = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let emittedText = false;

    try {
      const answerResult = dependencies.answerProvider.streamAnswer({
        question: input.question,
        context,
        assistant: input.assistant,
        evidence: coverageDecision.evidence.map(
          ({ contentUnitId, exactExcerpt }) => ({
            contentUnitId,
            exactExcerpt,
          }),
        ),
      });

      for await (const delta of answerResult.textStream) {
        if (delta) {
          emittedText = true;
          yield {
            type: "text_delta",
            delta,
          };
        }
      }

      const answerMetadata = await answerResult.metadata;
      await recordSuccessfulCall(
        input.organizationId,
        "answer",
        dependencies.answerProvider,
        answerMetadata,
        dependencies.callLogger,
        factualRequest.id,
      );
      answerCompleted = true;
      break;
    } catch (error) {
      await recordFailedCall(
        input.organizationId,
        "answer",
        dependencies.answerProvider,
        error,
        dependencies.callLogger,
        factualRequest.id,
      );

      if (
        await waitForRateLimitRetry(
          error,
          attempt,
          dependencies.rateLimitRetry,
          !emittedText,
        )
      ) {
        continue;
      }

      throw error;
    }
  }

  if (!answerCompleted) {
    throw new Error("回答生成重试状态无效");
  }

  yield maybeAttachResponseDecisionAudit(
    {
      type: "complete",
      resultType: "grounded_answer",
      citations: createCitations(evidence),
    },
    input.factualRequest,
    coverageDecision,
  );
}

export type AuditedAssistantResponseEvent = AssistantResponseEvent & {
  [responseDecisionAuditSymbol]?: AssistantDecisionAudit;
};

function maybeAttachResponseDecisionAudit<T extends AssistantResponseEvent>(
  event: T,
  factualRequest: AuditedFactualRequest | undefined,
  coverage: EvidenceCoverageDecision,
): T {
  if (!factualRequest) {
    return event;
  }

  Object.defineProperty(event, responseDecisionAuditSymbol, {
    value: { factualRequest, coverage } satisfies ResponseDecisionAudit,
    enumerable: false,
  });
  return event;
}

function createRetrievalQuestion(
  question: string,
  context: ConversationContextMessage[],
) {
  if (context.length === 0) {
    return question;
  }

  return [
    "近期会话消息：",
    ...context.map(({ role, content }) =>
      `${role === "visitor" ? "访客" : "助手"}：${content}`,
    ),
    "当前问题：",
    question,
  ].join("\n");
}

function createGroundedRefusal(
  assistant: GroundedAnswerInput["assistant"],
  question: string,
): GroundedAnswerEvent {
  return {
    type: "refusal",
    resultType: "grounded_refusal",
    message: detectQuestionLanguage(question) === "en"
      ? "The currently available knowledge is insufficient to support a factual answer to this question."
      : "当前可用知识不足以支持这个问题的事实性回答。",
    contact: {
      label: assistant.humanContactLabel,
      url: assistant.humanContactUrl,
    },
  };
}

function createCitations(evidence: GroundedEvidence[]) {
  const citations = new Map<string, GroundedCitation>();

  for (const item of evidence) {
    if (!citations.has(item.knowledgeSourceId)) {
      citations.set(item.knowledgeSourceId, {
        knowledgeSourceId: item.knowledgeSourceId,
        title: item.sourceTitle,
        url: normalizeCitationUrl(item.sourceUrl),
      });
    }

    if (citations.size === 3) {
      break;
    }
  }

  return [...citations.values()];
}

function normalizeCitationUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

async function recordSuccessfulCall(
  organizationId: string,
  callType: AiCallLog["callType"],
  identity: ProviderIdentity,
  metadata: ProviderCallMetadata,
  callLogger: GroundedAnswerDependencies["callLogger"],
  factualRequestId?: string,
) {
  await callLogger.record({
    organizationId,
    factualRequestId,
    callType,
    provider: identity.provider,
    model: identity.model,
    inputTokens: metadata.tokens.input,
    outputTokens: metadata.tokens.output,
    totalTokens: metadata.tokens.total,
    durationMs: metadata.durationMs,
    outcome: "success",
    errorType: null,
    traceId: metadata.traceId,
  });
}

async function runLoggedProviderCall<T>(
  organizationId: string,
  callType: AiCallLog["callType"],
  identity: ProviderIdentity,
  callLogger: GroundedAnswerDependencies["callLogger"],
  operation: () => Promise<ProviderCallResult<T>>,
  rateLimitRetry?: GroundedAnswerDependencies["rateLimitRetry"],
  factualRequestId?: string,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await operation();
      await recordSuccessfulCall(
        organizationId,
        callType,
        identity,
        result,
        callLogger,
        factualRequestId,
      );
      return result;
    } catch (error) {
      await recordFailedCall(
        organizationId,
        callType,
        identity,
        error,
        callLogger,
        factualRequestId,
      );

      if (await waitForRateLimitRetry(error, attempt, rateLimitRetry)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("供应商调用重试状态无效");
}

async function waitForRateLimitRetry(
  error: unknown,
  attempt: number,
  retry: GroundedAnswerDependencies["rateLimitRetry"],
  safeToRetry = true,
) {
  if (
    attempt !== 0 ||
    !safeToRetry ||
    !(error instanceof ProviderCallError) ||
    error.errorType !== "rate_limit" ||
    !retry
  ) {
    return false;
  }

  await retry.wait(retry.delayMs);
  return true;
}

async function recordFailedCall(
  organizationId: string,
  callType: AiCallLog["callType"],
  identity: ProviderIdentity,
  error: unknown,
  callLogger: GroundedAnswerDependencies["callLogger"],
  factualRequestId?: string,
) {
  const metadata =
    error instanceof ProviderCallError
      ? error
      : {
          durationMs: 0,
          errorType: "unknown" as const,
          tokens: { input: 0, output: 0, total: 0 },
          traceId: crypto.randomUUID(),
        };

  await callLogger.record({
    organizationId,
    factualRequestId,
    callType,
    provider: identity.provider,
    model: identity.model,
    inputTokens: metadata.tokens.input,
    outputTokens: metadata.tokens.output,
    totalTokens: metadata.tokens.total,
    durationMs: metadata.durationMs,
    outcome: "error",
    errorType: metadata.errorType,
    traceId: metadata.traceId,
  });
}
