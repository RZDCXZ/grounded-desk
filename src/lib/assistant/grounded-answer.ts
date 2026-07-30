import {
  ProviderCallError,
  type ProviderCallMetadata,
  type ProviderCallResult,
  type ProviderErrorType,
} from "../ai/provider-call.ts";
import type { ConversationResultType } from "./conversation-result.ts";
import { detectQuestionLanguage } from "./question-language.ts";

export { ProviderCallError } from "../ai/provider-call.ts";

export type RetrievedContentUnit = {
  id: string;
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

export type GroundedCitation = {
  knowledgeSourceId: string;
  title: string;
  url: string | null;
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
      resultType: "grounded_answer";
      citations: GroundedCitation[];
    };

export type AiCallLog = {
  organizationId: string;
  callType: "embedding" | "rerank" | "answer";
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

type GroundedAnswerDependencies = {
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
  answerProvider: ProviderIdentity & {
    streamAnswer(input: {
      question: string;
      context: ConversationContextMessage[];
      assistant: GroundedAnswerInput["assistant"];
      evidence: GroundedEvidence[];
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
    evidenceThreshold: number;
  };
};

type GroundedAnswerInput = {
  organizationId: string;
  question: string;
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
): AsyncGenerator<GroundedAnswerEvent> {
  const context = input.context ?? [];
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
  );

  const candidates = await dependencies.candidateRepository.retrieve(
    input.organizationId,
    embeddingResult.value,
    dependencies.config.candidateLimit,
  );

  if (candidates.length === 0) {
    yield createGroundedRefusal(input.assistant, input.question);
    return;
  }

  const rerankingResult = await runLoggedProviderCall(
    input.organizationId,
    "rerank",
    dependencies.rerankingProvider,
    dependencies.callLogger,
    () => dependencies.rerankingProvider.rerank(
      retrievalQuestion,
      candidates,
    ),
    dependencies.rateLimitRetry,
  );

  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const evidence = rerankingResult.value
    .filter(({ score }) => score >= dependencies.config.evidenceThreshold)
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

  if (evidence.length === 0) {
    yield createGroundedRefusal(input.assistant, input.question);
    return;
  }

  let answerCompleted = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let emittedText = false;

    try {
      const answerResult = dependencies.answerProvider.streamAnswer({
        question: input.question,
        context,
        assistant: input.assistant,
        evidence,
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

  yield {
    type: "complete",
    resultType: "grounded_answer",
    citations: createCitations(evidence),
  };
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
) {
  await callLogger.record({
    organizationId,
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
      );
      return result;
    } catch (error) {
      await recordFailedCall(
        organizationId,
        callType,
        identity,
        error,
        callLogger,
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
