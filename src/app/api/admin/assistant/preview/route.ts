import { streamGroundedAnswer } from "@/lib/assistant/grounded-answer";
import { createSupabaseGroundedAnswerDependencies } from "@/lib/assistant/supabase-grounded-answer";
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
    .select("name, service_scope, tone")
    .eq("organization_id", organization.id)
    .single();

  if (error || !assistant) {
    return Response.json(
      { message: "暂时无法加载助手配置，请稍后重试。" },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamGroundedAnswer(
          {
            organizationId: organization.id,
            question: questionResult.question,
            assistant: {
              name: assistant.name,
              serviceScope: assistant.service_scope,
              tone: assistant.tone,
            },
          },
          createSupabaseGroundedAnswerDependencies(supabase),
        )) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: "error",
              message: "暂时无法完成预览，请稍后重试。",
            })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/x-ndjson; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
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
