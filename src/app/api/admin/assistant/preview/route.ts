import { createAssistantPreviewResponse } from "@/lib/assistant/preview-response";
import {
  streamStructuredAssistantResponse,
} from "@/lib/assistant/request-analysis";
import { streamSingleSectionResponse } from "@/lib/assistant/response-sections";
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

  const assistantConfiguration = {
    name: assistant.name,
    serviceScope: assistant.service_scope,
    tone: assistant.tone,
    humanContactLabel: assistant.human_contact_label,
    humanContactUrl: assistant.human_contact_url,
  };
  const question = questionResult.question;
  const factualRequestId = crypto.randomUUID();
  const analysisInput = {
    organizationId: organization.id,
    question,
    assistant: assistantConfiguration,
    factualRequestId,
  };
  const analysisDependencies =
    createSupabaseRequestAnalysisDependencies(supabase);

  return createAssistantPreviewResponse(
    streamSingleSectionResponse(
      streamStructuredAssistantResponse(
        analysisInput,
        {
          requestAnalysis: analysisDependencies,
          groundedAnswer:
            createSupabaseGroundedAnswerDependencies(supabase),
        },
      ),
      factualRequestId,
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

  return {
    status: "valid" as const,
    question,
  };
}
