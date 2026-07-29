import type { GroundedCitation } from "./grounded-answer.ts";

export type AssistantResponseStreamEvent =
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "complete";
      citations: GroundedCitation[];
    }
  | {
      type: "refusal";
      message: string;
      contact: {
        label: string;
        url: string;
      };
    }
  | {
      type: "temporary_failure";
      reason: "input_rejected" | "rate_limited" | "provider_failure";
      message: string;
      retryable: true;
      contact: {
        label: string;
        url: string;
      };
    };

export async function consumeAssistantResponseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: AssistantResponseStreamEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        onEvent(JSON.parse(line) as AssistantResponseStreamEvent);
      }
    }

    if (done) {
      if (buffer.trim()) {
        onEvent(JSON.parse(buffer) as AssistantResponseStreamEvent);
      }
      return;
    }
  }
}
