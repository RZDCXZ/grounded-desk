import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));

test("真实 AI 冒烟未显式授权时在调用供应商前停止", async () => {
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "scripts/smoke-live-ai.ts"],
    {
      cwd: projectDirectory,
      env: {
        ...process.env,
        RUN_LIVE_AI_SMOKE: "false",
        DEEPSEEK_API_KEY: "must-not-be-used",
        SILICONFLOW_API_KEY: "must-not-be-used",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /RUN_LIVE_AI_SMOKE=true/);
  assert.match(stderr, /真实模型额度/);
});

test("真实 AI 冒烟缺少模型密钥时明确跳过且不伪装通过", async () => {
  const environmentWithoutModelKeys = { ...process.env };
  delete environmentWithoutModelKeys.DEEPSEEK_API_KEY;
  delete environmentWithoutModelKeys.SILICONFLOW_API_KEY;
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "scripts/smoke-live-ai.ts"],
    {
      cwd: projectDirectory,
      env: {
        ...environmentWithoutModelKeys,
        RUN_LIVE_AI_SMOKE: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });

  assert.equal(exitCode, 0);
  assert.match(stdout, /真实 AI 冒烟已跳过/);
  assert.match(stdout, /DEEPSEEK_API_KEY/);
  assert.match(stdout, /SILICONFLOW_API_KEY/);
  assert.doesNotMatch(stdout + stderr, /冒烟通过/);
});

test("真实 AI 冒烟通过完整链路验证有据回答、可靠拒答和多轮追问", async () => {
  const providerCalls: Array<{ path: string; body: string }> = [];
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    providerCalls.push({ path: request.url ?? "", body });

    if (request.url === "/embeddings") {
      const payload = JSON.parse(body) as { input: string[] };
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        data: payload.input.map((_text, index) => ({
          index,
          embedding: createEmbedding(index),
        })),
        usage: {
          prompt_tokens: payload.input.length * 4,
          total_tokens: payload.input.length * 4,
        },
      }));
      return;
    }

    if (request.url === "/rerank") {
      const payload = JSON.parse(body) as { documents: string[] };
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        results: payload.documents.map((_document, index) => ({
          index,
          relevance_score: 0.99 - index * 0.01,
        })),
        meta: {
          tokens: { input_tokens: 8, output_tokens: 2 },
        },
      }));
      return;
    }

    if (request.url === "/chat/completions") {
      const payload = JSON.parse(body) as { stream?: boolean };
      if (payload.stream) {
        const answer = body.includes("如何隔离样式")
          ? "GroundedDesk 的嵌入入口使用独立 iframe 隔离宿主网站样式。"
          : "GroundedDesk 发布后的助手可以通过公开页面直接访问。";
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "x-request-id": "fake-answer-trace",
        });
        response.end(createAnswerEventStream(answer));
        return;
      }

      const coverage = body.includes("年度营收")
        ? { status: "unsupported", evidence: [] }
        : body.includes("如何隔离样式")
          ? {
              status: "supported",
              evidence: [{
                contentUnitId: "live-smoke-embed",
                relationship: "supports",
                exactExcerpt:
                  "GroundedDesk 的嵌入入口使用独立 iframe 隔离宿主网站样式。",
                reason: "候选原文直接回答了嵌入样式隔离方式。",
              }],
            }
          : {
              status: "supported",
              evidence: [{
                contentUnitId: "live-smoke-public-page",
                relationship: "supports",
                exactExcerpt:
                  "GroundedDesk 发布后的助手可以通过公开页面直接访问。",
                reason: "候选原文直接回答了发布后的访问方式。",
              }],
            };
      response.writeHead(200, {
        "content-type": "application/json",
        "x-request-id": "fake-coverage-trace",
      });
      response.end(JSON.stringify(createChatCompletion(coverage)));
      return;
    }

    response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const providerBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "scripts/smoke-live-ai.ts"],
      {
        cwd: projectDirectory,
        env: {
          ...process.env,
          RUN_LIVE_AI_SMOKE: "true",
          DEEPSEEK_API_KEY: "test-deepseek-key",
          DEEPSEEK_BASE_URL: providerBaseUrl,
          SILICONFLOW_API_KEY: "test-siliconflow-key",
          SILICONFLOW_BASE_URL: providerBaseUrl,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? -1));
    });

    assert.equal(exitCode, 0, stderr);
    assert.match(stdout, /有据回答：PASS/);
    assert.match(stdout, /预期知识来源“助手发布与网站接入”/);
    assert.match(stdout, /可靠拒答：PASS/);
    assert.match(stdout, /多轮追问：PASS/);
    assert.ok(
      providerCalls.filter(({ path }) => path === "/embeddings").length >= 4,
    );
    assert.ok(
      providerCalls.filter(({ path }) => path === "/rerank").length >= 3,
    );
    assert.ok(
      providerCalls.filter(({ path }) => path === "/chat/completions").length >=
        5,
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("真实 AI 冒烟失败时报告阶段、供应商、模型、错误类型和追踪 ID", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(503, {
      "content-type": "application/json",
      "x-siliconcloud-trace-id": "fake-embedding-failure-trace",
    });
    response.end(JSON.stringify({ error: { message: "unavailable" } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const providerBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "scripts/smoke-live-ai.ts"],
      {
        cwd: projectDirectory,
        env: {
          ...process.env,
          RUN_LIVE_AI_SMOKE: "true",
          DEEPSEEK_API_KEY: "diagnostic-deepseek-secret",
          DEEPSEEK_BASE_URL: providerBaseUrl,
          SILICONFLOW_API_KEY: "diagnostic-siliconflow-secret",
          SILICONFLOW_BASE_URL: providerBaseUrl,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? -1));
    });

    assert.equal(exitCode, 1);
    assert.match(stderr, /\[知识来源向量化\]/);
    assert.match(stderr, /provider=siliconflow/);
    assert.match(stderr, /model=BAAI\/bge-m3/);
    assert.match(stderr, /errorType=provider_http/);
    assert.match(stderr, /traceId=fake-embedding-failure-trace/);
    assert.doesNotMatch(stderr, /diagnostic-(deepseek|siliconflow)-secret/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

function createEmbedding(index: number) {
  const embedding = Array<number>(1_024).fill(0);
  embedding[index % embedding.length] = 1;
  return embedding;
}

function createChatCompletion(output: unknown) {
  return {
    id: "fake-coverage-completion",
    object: "chat.completion",
    created: 1_785_600_000,
    model: "deepseek-v4-flash",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: JSON.stringify(output),
      },
      finish_reason: "stop",
    }],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
    },
  };
}

function createAnswerEventStream(answer: string) {
  const chunk = {
    id: "fake-answer-completion",
    object: "chat.completion.chunk",
    created: 1_785_600_000,
    model: "deepseek-v4-flash",
    choices: [{
      index: 0,
      delta: { role: "assistant", content: answer },
      finish_reason: null,
    }],
  };
  const finish = {
    ...chunk,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 6,
      total_tokens: 16,
    },
  };

  return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`;
}

async function readRequestBody(
  request: AsyncIterable<Uint8Array | string>,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
