import { createAssistantPreviewResponse } from "@/lib/assistant/preview-response";
import { createAssistantResponseConfiguration } from "@/lib/assistant/business-configuration";
import {
  streamReleasedSectionedAssistantResponse,
} from "@/lib/assistant/response-decision-release";
import type {
  ConversationContextMessage,
} from "@/lib/assistant/grounded-answer";
import type {
  ClarificationThreadState,
} from "@/lib/assistant/response-decision-audit";
import { createSupabaseGroundedAnswerDependencies } from "@/lib/assistant/supabase-grounded-answer";
import { createSupabaseRequestAnalysisDependencies } from "@/lib/assistant/supabase-request-analysis";
import { requireAdministrator } from "@/lib/auth/require-admin";

const MAXIMUM_QUESTION_LENGTH = 2_000;

export async function POST(request: Request) {
  const { supabase, organization } = await requireAdministrator();
  const questionResult = await readQuestion(request);

  if (questionResult.status === "invalid") {
    return Response.json(
      { message: questionResult.message },
      { status: 400 },
    );
  }

  const { data: assistant, error } = await supabase
    .from("assistants")
    .select(
      "name, service_scope, tone, human_contact_label, human_contact_url",
    )
    .eq("organization_id", organization.id)
    .single();

  if (error || !assistant) {
    return Response.json(
      { message: "暂时无法加载助手配置，请稍后重试。" },
      { status: 500 },
    );
  }

  const assistantConfiguration =
    createAssistantResponseConfiguration(assistant);
  const question = questionResult.question;
  const factualRequestId = crypto.randomUUID();
  const analysisInput = {
    organizationId: organization.id,
    question,
    context: questionResult.context,
    clarificationState: questionResult.clarificationState,
    clarificationStates: questionResult.clarificationStates,
    assistant: assistantConfiguration,
    factualRequestId,
  };
  const analysisDependencies =
    createSupabaseRequestAnalysisDependencies(supabase);

  return createAssistantPreviewResponse(
    streamReleasedSectionedAssistantResponse(
      analysisInput,
      {
        requestAnalysis: analysisDependencies,
        groundedAnswer:
          createSupabaseGroundedAnswerDependencies(supabase),
      },
    ),
    {
      label: assistant.human_contact_label,
      url: assistant.human_contact_url,
    },
  );
}

async function readQuestion(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return {
      status: "invalid" as const,
      message: "请输入要预览的问题。",
    };
  }

  const question =
    typeof payload === "object" &&
    payload !== null &&
    "question" in payload &&
    typeof payload.question === "string"
      ? payload.question.trim()
      : "";
  const previewContext =
    typeof payload === "object" &&
    payload !== null &&
    "context" in payload
      ? readPreviewContext(payload.context)
      : [];
  const clarificationState =
    typeof payload === "object" &&
    payload !== null &&
    "clarificationState" in payload
      ? readClarificationState(payload.clarificationState)
      : undefined;
  const clarificationStates =
    typeof payload === "object" &&
    payload !== null &&
    "clarificationStates" in payload
      ? readClarificationStates(payload.clarificationStates)
      : undefined;

  if (!question) {
    return {
      status: "invalid" as const,
      message: "请输入要预览的问题。",
    };
  }

  if (question.length > MAXIMUM_QUESTION_LENGTH) {
    return {
      status: "invalid" as const,
      message: `问题不能超过 ${MAXIMUM_QUESTION_LENGTH} 个字符。`,
    };
  }

  if (
    !previewContext ||
    clarificationState === null ||
    clarificationStates === null
  ) {
    return {
      status: "invalid" as const,
      message: "预览会话上下文无效。",
    };
  }

  return {
    status: "valid" as const,
    question,
    context: previewContext,
    clarificationState,
    clarificationStates,
  };
}

function readClarificationStates(
  value: unknown,
): ClarificationThreadState[] | null {
  if (!Array.isArray(value) || value.length > 3) {
    return null;
  }
  const states = value.map(readClarificationState);
  return states.some((state) => state === null)
    ? null
    : states as ClarificationThreadState[];
}

function readClarificationState(
  value: unknown,
): ClarificationThreadState | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("originalText" in value) ||
    typeof value.originalText !== "string" ||
    !value.originalText.trim() ||
    value.originalText.length > 2_000 ||
    !("round" in value) ||
    (value.round !== 1 && value.round !== 2) ||
    !("latestClarification" in value) ||
    typeof value.latestClarification !== "string" ||
    !value.latestClarification.trim() ||
    value.latestClarification.length > 20_000
  ) {
    return null;
  }

  return {
    originalText: value.originalText,
    round: value.round,
    latestClarification: value.latestClarification,
  };
}

function readPreviewContext(
  value: unknown,
): ConversationContextMessage[] | null {
  if (!Array.isArray(value) || value.length > 6) {
    return null;
  }

  const context: ConversationContextMessage[] = [];
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      !("role" in item) ||
      (item.role !== "visitor" && item.role !== "assistant") ||
      !("content" in item) ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > 20_000
    ) {
      return null;
    }

    const resultType =
      "resultType" in item ? item.resultType : null;
    if (
      item.role === "visitor"
        ? resultType !== null
        : !isPreviewContextResultType(resultType)
    ) {
      return null;
    }

    context.push({
      role: item.role,
      content: item.content,
      resultType,
    });
  }

  return context;
}

function isPreviewContextResultType(
  value: unknown,
): value is NonNullable<ConversationContextMessage["resultType"]> {
  return value === "grounded_answer" ||
    value === "partially_grounded_answer" ||
    value === "knowledge_conflict" ||
    value === "grounded_refusal" ||
    value === "conversational_response" ||
    value === "clarification_request" ||
    value === "human_handoff";
}
