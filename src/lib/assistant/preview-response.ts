import { ProviderCallError } from "../ai/provider-call.ts";
import type { QuestionLanguage } from "./question-language.ts";
import type {
  SectionedAssistantResponseEvent,
} from "./response-sections.ts";

type PreviewContact = {
  label: string;
  url: string;
};

export function createAssistantPreviewResponse(
  events: AsyncIterable<SectionedAssistantResponseEvent>,
  contact: PreviewContact,
  language: QuestionLanguage = "zh",
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        const failure = describeTemporaryFailure(error, language);
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: "temporary_failure",
              ...failure,
              retryable: true,
              contact,
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

function describeTemporaryFailure(
  error: unknown,
  language: QuestionLanguage,
) {
  if (error instanceof ProviderCallError) {
    if (error.errorType === "rate_limit") {
      return {
        reason: "rate_limited" as const,
        message:
          language === "en"
            ? "The provider rate limit was reached. Please try again later."
            : "供应商请求频率受限，请稍后重试。",
      };
    }

    if (error.errorType === "input_rejected") {
      return {
        reason: "input_rejected" as const,
        message:
          language === "en"
            ? "The provider did not accept this input. Please revise the question and try again."
            : "当前输入未被供应商接受，请调整问题后重试。",
      };
    }
  }

  return {
    reason: "provider_failure" as const,
    message:
      language === "en"
        ? "The provider service is temporarily unavailable. Please try again later."
        : "供应商服务暂时不可用，请稍后重试。",
  };
}
