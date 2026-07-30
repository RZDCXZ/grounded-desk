import {
  ProviderCallError,
  type ProviderCallResult,
} from "../ai/provider-call.ts";
import {
  streamConversationalResponse,
  type ConversationalCategory,
} from "./conversational-response.ts";
import {
  streamGroundedAnswer,
  type AiCallLog,
  type AssistantResponseEvent,
  type ConversationContextMessage,
  type GroundedAnswerDependencies,
  type GroundedAnswerInput,
} from "./grounded-answer.ts";

const REQUEST_ANALYSIS_VERSION = "request-analysis-v1";
const MAXIMUM_FACTUAL_REQUESTS = 3;
const MAXIMUM_QUESTION_LENGTH = 2_000;
const MAXIMUM_NORMALIZED_QUESTION_LENGTH = 1_000;
const MAXIMUM_MISSING_INFORMATION_LENGTH = 300;

export type RequestAnalysisLanguage = "zh" | "en";
export type RequestInteractionType =
  | "conversational"
  | "factual"
  | "mixed"
  | "incomplete";

export type RequestAnalysisCandidate = {
  language: RequestAnalysisLanguage;
  interactionType: RequestInteractionType;
  conversationalIntent: ConversationalCategory | null;
  factualRequests: Array<{
    originalText: string;
    normalizedQuestion: string;
    completeness: "complete" | "incomplete";
    missingInformation: string[];
  }>;
};

export type RequestAnalysis = Omit<
  RequestAnalysisCandidate,
  "factualRequests"
> & {
  version: typeof REQUEST_ANALYSIS_VERSION;
  factualRequests: Array<
    RequestAnalysisCandidate["factualRequests"][number] & {
      id: string;
      order: number;
    }
  >;
};

export type RequestAnalysisInput = {
  organizationId: string;
  question: string;
  context?: ConversationContextMessage[];
  assistant: {
    name: string;
    serviceScope: string;
    tone?: string;
  };
};

export type RequestAnalysisDependencies = {
  provider: {
    provider: string;
    model: string;
    analyze(
      input: RequestAnalysisInput,
    ): Promise<ProviderCallResult<unknown>>;
  };
  callLogger: {
    record(log: AiCallLog): Promise<void>;
  };
};

type StructuredAssistantResponseInput = Omit<
  RequestAnalysisInput,
  "assistant"
> & {
  assistant: GroundedAnswerInput["assistant"];
};

export async function analyzeAssistantRequest(
  input: RequestAnalysisInput,
  dependencies: RequestAnalysisDependencies,
): Promise<RequestAnalysis> {
  let finalError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result: ProviderCallResult<unknown>;
    let candidate: RequestAnalysisCandidate | null;

    try {
      result = await dependencies.provider.analyze(input);
      candidate = validateRequestAnalysisCandidate(result.value);

      if (!candidate) {
        throw new ProviderCallError("请求分析服务返回无效结果", {
          errorType: "invalid_response",
          traceId: result.traceId,
          durationMs: result.durationMs,
          tokens: result.tokens,
        });
      }
    } catch (error) {
      finalError = error;
      await recordFailedAnalysisCall(
        input.organizationId,
        dependencies,
        error,
      );
      continue;
    }

    try {
      await dependencies.callLogger.record({
        organizationId: input.organizationId,
        callType: "request_analysis",
        provider: dependencies.provider.provider,
        model: dependencies.provider.model,
        inputTokens: result.tokens.input,
        outputTokens: result.tokens.output,
        totalTokens: result.tokens.total,
        durationMs: result.durationMs,
        outcome: "success",
        errorType: null,
        traceId: result.traceId,
      });
    } catch (error) {
      throw new Error(
        "无法记录请求分析调用元数据",
        { cause: error },
      );
    }

    return {
      version: REQUEST_ANALYSIS_VERSION,
      ...candidate,
      factualRequests: candidate.factualRequests.map(
        (request, index) => ({
          id: crypto.randomUUID(),
          order: index + 1,
          ...request,
        }),
      ),
    };
  }

  throw finalError;
}

export function streamAnalyzedAssistantResponse(
  input: RequestAnalysisInput,
  dependencies: {
    analyzeRequest(
      input: RequestAnalysisInput,
    ): Promise<RequestAnalysis>;
    streamKnowledgeResponse(
      analysis: RequestAnalysis,
    ): AsyncIterable<AssistantResponseEvent>;
  },
): AsyncIterable<AssistantResponseEvent> {
  return (async function* () {
    const analysis = await dependencies.analyzeRequest(input);

    if (analysis.interactionType === "conversational") {
      if (!analysis.conversationalIntent) {
        throw new Error("交流性请求分析缺少交流意图");
      }

      yield* streamConversationalResponse({
        question: input.question,
        category: analysis.conversationalIntent,
        language: analysis.language,
        assistant: {
          ...input.assistant,
          tone: input.assistant.tone ?? "professional",
        },
      });
      return;
    }

    const incompleteRequest = analysis.factualRequests.find(
      ({ completeness }) => completeness === "incomplete",
    );
    if (incompleteRequest) {
      yield* streamClarificationRequest(
        analysis.language,
        incompleteRequest.missingInformation,
      );
      return;
    }

    yield* dependencies.streamKnowledgeResponse(analysis);
  })();
}

export function streamStructuredAssistantResponse(
  input: StructuredAssistantResponseInput,
  dependencies: {
    requestAnalysis: RequestAnalysisDependencies;
    groundedAnswer: GroundedAnswerDependencies;
  },
): AsyncIterable<AssistantResponseEvent> {
  return streamAnalyzedAssistantResponse(input, {
    analyzeRequest(currentInput) {
      return analyzeAssistantRequest(
        currentInput,
        dependencies.requestAnalysis,
      );
    },
    streamKnowledgeResponse(analysis) {
      const request = analysis.factualRequests[0];
      return streamGroundedAnswer(
        {
          ...input,
          question:
            analysis.factualRequests.length === 1 && request
              ? request.normalizedQuestion
              : input.question,
        },
        dependencies.groundedAnswer,
      );
    },
  });
}

function validateRequestAnalysisCandidate(
  value: unknown,
): RequestAnalysisCandidate | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "language",
      "interactionType",
      "conversationalIntent",
      "factualRequests",
    ]) ||
    (value.language !== "zh" && value.language !== "en") ||
    !isInteractionType(value.interactionType) ||
    !isConversationalIntent(value.conversationalIntent) ||
    !Array.isArray(value.factualRequests) ||
    value.factualRequests.length > MAXIMUM_FACTUAL_REQUESTS
  ) {
    return null;
  }

  const factualRequests = value.factualRequests.flatMap((request) => {
    if (
      !isRecord(request) ||
      !hasExactKeys(request, [
        "originalText",
        "normalizedQuestion",
        "completeness",
        "missingInformation",
      ]) ||
      !isBoundedText(request.originalText, MAXIMUM_QUESTION_LENGTH) ||
      !isBoundedText(
        request.normalizedQuestion,
        MAXIMUM_NORMALIZED_QUESTION_LENGTH,
      ) ||
      (
        request.completeness !== "complete" &&
        request.completeness !== "incomplete"
      ) ||
      !Array.isArray(request.missingInformation) ||
      request.missingInformation.length > 5 ||
      !request.missingInformation.every((item) =>
        isBoundedText(item, MAXIMUM_MISSING_INFORMATION_LENGTH)
      ) ||
      (
        request.completeness === "complete" &&
        request.missingInformation.length !== 0
      ) ||
      (
        request.completeness === "incomplete" &&
        request.missingInformation.length === 0
      )
    ) {
      return [];
    }

    return [{
      originalText: request.originalText as string,
      normalizedQuestion: request.normalizedQuestion as string,
      completeness: request.completeness as "complete" | "incomplete",
      missingInformation: [
        ...(request.missingInformation as string[]),
      ],
    }];
  });

  if (factualRequests.length !== value.factualRequests.length) {
    return null;
  }

  const hasFacts = factualRequests.length > 0;
  const hasIntent = value.conversationalIntent !== null;
  if (
    (
      value.interactionType === "conversational" &&
      (hasFacts || !hasIntent)
    ) ||
    (
      value.interactionType === "factual" &&
      (!hasFacts || hasIntent)
    ) ||
    (
      value.interactionType === "mixed" &&
      (!hasFacts || !hasIntent)
    ) ||
    (
      value.interactionType === "incomplete" &&
      (
        !hasFacts ||
        !factualRequests.some(
          ({ completeness }) => completeness === "incomplete",
        )
      )
    )
  ) {
    return null;
  }

  return {
    language: value.language,
    interactionType: value.interactionType,
    conversationalIntent: value.conversationalIntent,
    factualRequests,
  };
}

function createFailedAnalysisLog(
  organizationId: string,
  dependencies: RequestAnalysisDependencies,
  error: unknown,
): AiCallLog {
  const metadata =
    error instanceof ProviderCallError
      ? error
      : {
          durationMs: 0,
          errorType: "unknown" as const,
          tokens: { input: 0, output: 0, total: 0 },
          traceId: crypto.randomUUID(),
        };

  return {
    organizationId,
    callType: "request_analysis",
    provider: dependencies.provider.provider,
    model: dependencies.provider.model,
    inputTokens: metadata.tokens.input,
    outputTokens: metadata.tokens.output,
    totalTokens: metadata.tokens.total,
    durationMs: metadata.durationMs,
    outcome: "error",
    errorType: metadata.errorType,
    traceId: metadata.traceId,
  };
}

async function recordFailedAnalysisCall(
  organizationId: string,
  dependencies: RequestAnalysisDependencies,
  error: unknown,
) {
  try {
    await dependencies.callLogger.record(
      createFailedAnalysisLog(
        organizationId,
        dependencies,
        error,
      ),
    );
  } catch {
    // The provider error remains authoritative for retry and diagnosis.
  }
}

function* streamClarificationRequest(
  language: RequestAnalysisLanguage,
  missingInformation: string[],
): Generator<AssistantResponseEvent> {
  const details = missingInformation.join(
    language === "en" ? "; " : "；",
  );
  const content = language === "en"
    ? `Please clarify: ${details}.`
    : `请补充：${details}。`;

  yield {
    type: "text_delta",
    delta: content,
  };
  yield {
    type: "complete",
    resultType: "clarification_request",
    citations: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: string[],
) {
  const expected = new Set(keys);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  );
}

function isBoundedText(value: unknown, maximumLength: number) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

function isInteractionType(
  value: unknown,
): value is RequestInteractionType {
  return (
    value === "conversational" ||
    value === "factual" ||
    value === "mixed" ||
    value === "incomplete"
  );
}

function isConversationalIntent(
  value: unknown,
): value is ConversationalCategory | null {
  return (
    value === null ||
    value === "greeting" ||
    value === "gratitude" ||
    value === "farewell" ||
    value === "identity" ||
    value === "capability" ||
    value === "out_of_scope"
  );
}
