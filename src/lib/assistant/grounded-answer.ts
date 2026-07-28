import {
  ProviderCallError,
  type ProviderCallMetadata,
  type ProviderCallResult,
} from "../ai/provider-call.ts";

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

export type GroundedAnswerEvent =
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "complete";
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
  errorType: string | null;
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
  config: {
    candidateLimit: number;
    evidenceLimit: number;
    evidenceThreshold: number;
  };
};

type GroundedAnswerInput = {
  organizationId: string;
  question: string;
  assistant: {
    name: string;
    serviceScope: string;
    tone: string;
  };
};

export async function* streamGroundedAnswer(
  input: GroundedAnswerInput,
  dependencies: GroundedAnswerDependencies,
): AsyncGenerator<GroundedAnswerEvent> {
  const embeddingResult = await runLoggedProviderCall(
    input.organizationId,
    "embedding",
    dependencies.questionEmbeddingProvider,
    dependencies.callLogger,
    () => dependencies.questionEmbeddingProvider.embed(input.question),
  );

  const candidates = await dependencies.candidateRepository.retrieve(
    input.organizationId,
    embeddingResult.value,
    dependencies.config.candidateLimit,
  );
  const rerankingResult = await runLoggedProviderCall(
    input.organizationId,
    "rerank",
    dependencies.rerankingProvider,
    dependencies.callLogger,
    () => dependencies.rerankingProvider.rerank(input.question, candidates),
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
    throw new Error("现有知识不足以形成有据回答");
  }

  let answerMetadata: ProviderCallMetadata;

  try {
    const answerResult = dependencies.answerProvider.streamAnswer({
      question: input.question,
      assistant: input.assistant,
      evidence,
    });

    for await (const delta of answerResult.textStream) {
      if (delta) {
        yield {
          type: "text_delta",
          delta,
        };
      }
    }

    answerMetadata = await answerResult.metadata;
  } catch (error) {
    await recordFailedCall(
      input.organizationId,
      "answer",
      dependencies.answerProvider,
      error,
      dependencies.callLogger,
    );
    throw error;
  }

  await recordSuccessfulCall(
    input.organizationId,
    "answer",
    dependencies.answerProvider,
    answerMetadata,
    dependencies.callLogger,
  );

  yield {
    type: "complete",
    citations: createCitations(evidence),
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
) {
  let result: ProviderCallResult<T>;

  try {
    result = await operation();
  } catch (error) {
    await recordFailedCall(
      organizationId,
      callType,
      identity,
      error,
      callLogger,
    );
    throw error;
  }

  await recordSuccessfulCall(
    organizationId,
    callType,
    identity,
    result,
    callLogger,
  );
  return result;
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
          errorType: "unknown",
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
