import assert from "node:assert/strict";
import test from "node:test";

import { ProviderCallError } from "../../src/lib/assistant/grounded-answer.ts";
import { createAssistantPreviewResponse } from "../../src/lib/assistant/preview-response.ts";

test("预览 HTTP 流将供应商超时映射为可重试技术故障而非可靠拒答", async () => {
  const response = createAssistantPreviewResponse(
    (async function* () {
      throw new ProviderCallError("回答生成超时", {
        errorType: "timeout",
        traceId: "answer-timeout",
        durationMs: 20_000,
      });
    })(),
  );

  assert.equal(
    response.headers.get("content-type"),
    "application/x-ndjson; charset=utf-8",
  );
  assert.deepEqual(await readNdjson(response), [
    {
      type: "temporary_failure",
      message: "供应商服务暂时不可用，请稍后重试。",
      retryable: true,
    },
  ]);
});

async function readNdjson(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}
