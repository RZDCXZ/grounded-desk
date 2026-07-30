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
import {
  responseDecisionAuditSymbol,
  type ClarificationDecisionAudit,
  type ClarificationThreadState,
} from "./response-decision-audit.ts";

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
      clarificationRound?: 0 | 1 | 2;
      requiresHumanHandoff?: boolean;
    }
  >;
};

export type RequestAnalysisInput = {
  organizationId: string;
  question: string;
  factualRequestId?: string;
  clarificationState?: ClarificationThreadState;
  context?: ConversationContextMessage[];
  assistant: {
    name: string;
    serviceScope: string;
    tone?: string;
    humanContactLabel?: string;
    humanContactUrl?: string;
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
    let clarificationStates:
      | Array<{
          clarificationRound: 0 | 1 | 2;
          requiresHumanHandoff: boolean;
        }>
      | null;

    try {
      result = await dependencies.provider.analyze(input);
      candidate = validateRequestAnalysisCandidate(result.value);
      clarificationStates = candidate
        ? deriveClarificationStates(input, candidate)
        : null;

      if (!candidate || !clarificationStates) {
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
          ...clarificationStates[index],
          ...request,
        }),
      ),
    };
  }

  throw finalError;
}

function deriveClarificationStates(
  input: RequestAnalysisInput,
  candidate: RequestAnalysisCandidate,
) {
  const thread = input.clarificationState
    ? {
        originalText: input.clarificationState.originalText,
        rounds: input.clarificationState.round,
        latestClarification:
          input.clarificationState.latestClarification,
      }
    : findTrailingClarificationThread(input.context ?? []);
  const states: Array<{
    clarificationRound: 0 | 1 | 2;
    requiresHumanHandoff: boolean;
  }> = [];

  for (const request of candidate.factualRequests) {
    if (request.completeness === "complete") {
      states.push({
        clarificationRound: 0 as const,
        requiresHumanHandoff: false,
      });
      continue;
    }

    const continuesThread =
      thread !== null &&
      normalizedText(request.originalText) ===
        normalizedText(thread.originalText);
    const previousRounds = continuesThread ? thread.rounds : 0;
    const requiresHumanHandoff = previousRounds >= 2;
    const clarificationRound = Math.min(
      previousRounds + 1,
      2,
    ) as 1 | 2;

    if (
      continuesThread &&
      previousRounds === 1 &&
      createClarificationContent(
        candidate.language,
        request.missingInformation,
      ) === thread.latestClarification
    ) {
      return null;
    }

    states.push({
      clarificationRound,
      requiresHumanHandoff,
    });
  }

  return states;
}

function findTrailingClarificationThread(
  context: ConversationContextMessage[],
) {
  let index = context.length - 1;
  let rounds = 0;
  let originalText = "";
  let latestClarification = "";

  while (index >= 1) {
    const assistant = context[index];
    const visitor = context[index - 1];
    if (
      assistant?.role !== "assistant" ||
      assistant.resultType !== "clarification_request" ||
      visitor?.role !== "visitor"
    ) {
      break;
    }

    rounds += 1;
    originalText = visitor.content;
    latestClarification ||= assistant.content;
    index -= 2;
  }

  return rounds > 0
    ? {
        rounds: Math.min(rounds, 2),
        originalText,
        latestClarification,
      }
    : null;
}

function normalizedText(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
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
      const clarificationRound =
        incompleteRequest.clarificationRound === 2 ? 2 : 1;
      const factualRequestId =
        input.factualRequestId ?? incompleteRequest.id;
      const outcome = incompleteRequest.requiresHumanHandoff
        ? "human_handoff"
        : "clarification_request";
      const audit = {
        factualRequest: {
          id: factualRequestId,
          originalText: incompleteRequest.originalText,
          normalizedQuestion: incompleteRequest.normalizedQuestion,
          requestAnalysisVersion: analysis.version,
          missingInformation: incompleteRequest.missingInformation,
          clarificationRound,
        },
        outcome,
        responseStrategyVersion: "clarification-handoff-v1",
      } satisfies ClarificationDecisionAudit;

      if (incompleteRequest.requiresHumanHandoff) {
        yield* attachClarificationDecisionAudit(
          streamHumanHandoff(
            analysis.language,
            input.assistant,
            incompleteRequest.missingInformation,
          ),
          audit,
        );
        return;
      }

      yield* attachClarificationDecisionAudit(
        streamClarificationRequest(
          analysis.language,
          incompleteRequest.missingInformation,
        ),
        audit,
      );
      return;
    }

    yield* dependencies.streamKnowledgeResponse(analysis);
  })();
}

async function* attachClarificationDecisionAudit(
  events:
    | Iterable<AssistantResponseEvent>
    | AsyncIterable<AssistantResponseEvent>,
  audit: ClarificationDecisionAudit,
): AsyncGenerator<AssistantResponseEvent> {
  for await (const event of events) {
    if (event.type === "complete") {
      Object.defineProperty(event, responseDecisionAuditSymbol, {
        value: audit,
        enumerable: false,
      });
    }
    yield event;
  }
}

function* streamHumanHandoff(
  language: RequestAnalysisLanguage,
  assistant: RequestAnalysisInput["assistant"],
  missingInformation: string[],
): Generator<AssistantResponseEvent> {
  if (
    !assistant.humanContactLabel ||
    !assistant.humanContactUrl
  ) {
    throw new Error("人工接续缺少已配置的联系入口");
  }

  const content = language === "en"
    ? `The following information is still needed: ${missingInformation.join("; ")}. Please contact the human support team.`
    : `目前仍缺少：${missingInformation.join("、")}。请联系人工团队协助。`;

  yield {
    type: "text_delta",
    delta: content,
  };
  yield {
    type: "complete",
    resultType: "human_handoff",
    citations: [],
    contact: {
      label: assistant.humanContactLabel,
      url: assistant.humanContactUrl,
    },
  };
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
          factualRequest:
            analysis.factualRequests.length === 1 && request
            ? {
                id: input.factualRequestId ?? request.id,
                originalText: request.originalText,
                normalizedQuestion: request.normalizedQuestion,
                requestAnalysisVersion: analysis.version,
              }
            : undefined,
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
  const content = createClarificationContent(language, missingInformation);

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

function createClarificationContent(
  language: RequestAnalysisLanguage,
  missingInformation: string[],
) {
  const details = missingInformation.join(
    language === "en" ? "; " : "；",
  );
  return language === "en"
    ? `Please clarify: ${details}.`
    : `请补充：${details}。`;
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
