import assert from "node:assert/strict";
import test from "node:test";

import {
  processManualKnowledgeRevision,
  type CompletedKnowledgeRevision,
} from "../../src/lib/knowledge/process-manual.ts";

test("完整手工正文形成保留标题与段落语义的可用内容单元和向量", async () => {
  let completedRevision: CompletedKnowledgeRevision | undefined;
  const embeddedTexts: string[][] = [];

  const result = await processManualKnowledgeRevision(
    {
      id: "revision-1",
      title: "演示服务说明",
      body: [
        "## 服务范围",
        "",
        "我们为演示网站提供知识整理、来源核查和有据回答配置服务，管理员可以持续维护业务内容。",
        "",
        "## 响应方式",
        "",
        "工作日的问题会在两个工作小时内确认，紧急情况请使用知识来源中列出的人工联系入口。",
      ].join("\n"),
    },
    {
      embeddingProvider: {
        async embed(texts) {
          embeddedTexts.push(texts);
          return texts.map((_, index) => [index + 0.1, index + 0.2]);
        },
      },
      revisionRepository: {
        async complete(revision) {
          completedRevision = revision;
        },
        async fail() {
          assert.fail("有效正文不应进入失败分支");
        },
      },
    },
  );

  assert.equal(result.status, "available");
  assert.equal(completedRevision?.id, "revision-1");
  assert.equal(completedRevision?.contentUnits.length, 2);
  assert.match(completedRevision?.contentUnits[0]?.content ?? "", /演示服务说明/);
  assert.match(completedRevision?.contentUnits[0]?.content ?? "", /服务范围/);
  assert.match(completedRevision?.contentUnits[0]?.content ?? "", /知识整理/);
  assert.match(completedRevision?.contentUnits[1]?.content ?? "", /响应方式/);
  assert.match(completedRevision?.contentUnits[1]?.content ?? "", /两个工作小时/);
  assert.deepEqual(
    embeddedTexts,
    [completedRevision?.contentUnits.map(({ content }) => content)],
  );
  assert.deepEqual(completedRevision?.contentUnits[1]?.embedding, [1.1, 1.2]);
});

test("正文过短时保存可理解的失败原因且不调用向量服务", async () => {
  let failure: { revisionId: string; reason: string } | undefined;

  const result = await processManualKnowledgeRevision(
    {
      id: "revision-short",
      title: "过短内容",
      body: "只有一句话。",
    },
    {
      embeddingProvider: {
        async embed() {
          assert.fail("无效正文不应调用向量服务");
        },
      },
      revisionRepository: {
        async complete() {
          assert.fail("无效正文不应形成可用知识版本");
        },
        async fail(revisionId, reason) {
          failure = { revisionId, reason };
        },
      },
    },
  );

  assert.deepEqual(result, {
    status: "failed",
    reason: "正文内容过短，请补充至少 80 个字符后重试。",
  });
  assert.deepEqual(failure, {
    revisionId: "revision-short",
    reason: "正文内容过短，请补充至少 80 个字符后重试。",
  });
});

test("正文过长时保存安全失败原因且不形成部分可用版本", async () => {
  let failureReason = "";

  const result = await processManualKnowledgeRevision(
    {
      id: "revision-long",
      title: "过长内容",
      body: "演".repeat(50_001),
    },
    {
      embeddingProvider: {
        async embed() {
          assert.fail("过长正文不应调用向量服务");
        },
      },
      revisionRepository: {
        async complete() {
          assert.fail("过长正文不应形成可用知识版本");
        },
        async fail(_revisionId, reason) {
          failureReason = reason;
        },
      },
    },
  );

  assert.deepEqual(result, {
    status: "failed",
    reason: "正文内容过长，请缩减到 50000 个字符以内后重试。",
  });
  assert.equal(
    failureReason,
    "正文内容过长，请缩减到 50000 个字符以内后重试。",
  );
});

test("正文无法形成有效内容单元时失败且不调用向量服务", async () => {
  let failureReason = "";

  const result = await processManualKnowledgeRevision(
    {
      id: "revision-empty-units",
      title: "只有结构没有正文",
      body: [
        "## 服务范围",
        "",
        "！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！！",
        "",
        "## 响应方式",
        "",
        "…………………………………………………………………………………………………………",
      ].join("\n"),
    },
    {
      embeddingProvider: {
        async embed() {
          assert.fail("没有有效内容单元时不应调用向量服务");
        },
      },
      revisionRepository: {
        async complete() {
          assert.fail("没有有效内容单元时不应形成可用知识版本");
        },
        async fail(_revisionId, reason) {
          failureReason = reason;
        },
      },
    },
  );

  assert.deepEqual(result, {
    status: "failed",
    reason: "正文无法形成有效内容单元，请补充清晰的标题和段落内容后重试。",
  });
  assert.equal(
    failureReason,
    "正文无法形成有效内容单元，请补充清晰的标题和段落内容后重试。",
  );
});

test("向量服务异常时保存安全失败原因且不形成部分可用版本", async () => {
  let failureReason = "";

  const result = await processManualKnowledgeRevision(
    {
      id: "revision-provider-error",
      title: "向量异常演示",
      body: [
        "## 服务范围",
        "",
        "这是足够长的演示正文，用于确认外部向量服务暂时不可用时，系统不会暴露供应商响应或留下部分可用数据。",
        "",
        "管理员应当只看到安全、明确并且可以采取重试行动的失败说明。",
      ].join("\n"),
    },
    {
      embeddingProvider: {
        async embed() {
          throw new Error("provider token abc123 and internal trace");
        },
      },
      revisionRepository: {
        async complete() {
          assert.fail("向量失败不应形成可用知识版本");
        },
        async fail(_revisionId, reason) {
          failureReason = reason;
        },
      },
    },
  );

  assert.deepEqual(result, {
    status: "failed",
    reason: "向量服务暂时不可用，请稍后重试。",
  });
  assert.equal(failureReason, "向量服务暂时不可用，请稍后重试。");
  assert.doesNotMatch(failureReason, /abc123|trace|provider/i);
});

test("完整版本提交异常时转为安全失败状态", async () => {
  let failureReason = "";

  const result = await processManualKnowledgeRevision(
    {
      id: "revision-commit-error",
      title: "提交异常演示",
      body: [
        "## 服务范围",
        "",
        "这是足够长的演示正文，用于确认内容单元与向量已经准备完成，但数据库无法原子提交完整知识版本时的行为。",
        "",
        "管理员只应看到可理解的处理失败提示，任何底层数据库错误都不应出现在界面中。",
      ].join("\n"),
    },
    {
      embeddingProvider: {
        async embed(texts) {
          return texts.map(() => [0.1, 0.2]);
        },
      },
      revisionRepository: {
        async complete() {
          throw new Error("database connection details");
        },
        async fail(_revisionId, reason) {
          failureReason = reason;
        },
      },
    },
  );

  assert.deepEqual(result, {
    status: "failed",
    reason: "知识处理暂时无法完成，请稍后重试。",
  });
  assert.equal(failureReason, "知识处理暂时无法完成，请稍后重试。");
  assert.doesNotMatch(failureReason, /database|connection/i);
});

test("超长段落按语义边界形成多个可向量化内容单元", async () => {
  let completedRevision: CompletedKnowledgeRevision | undefined;
  const longParagraph = Array.from(
    { length: 24 },
    (_, index) =>
      `第${index + 1}项服务说明包含来源核查、知识整理、处理状态确认和后续维护建议，管理员可以据此验证完整业务语义。`,
  ).join("");

  const result = await processManualKnowledgeRevision(
    {
      id: "revision-long-paragraph",
      title: "完整服务项目",
      body: `## 服务项目\n\n${longParagraph}`,
    },
    {
      embeddingProvider: {
        async embed(texts) {
          return texts.map(() => [0.1, 0.2]);
        },
      },
      revisionRepository: {
        async complete(revision) {
          completedRevision = revision;
        },
        async fail() {
          assert.fail("合法的长段落不应处理失败");
        },
      },
    },
  );

  assert.equal(result.status, "available");
  assert.ok((completedRevision?.contentUnits.length ?? 0) > 1);
  assert.ok(
    completedRevision?.contentUnits.every(
      ({ content }) => Array.from(content).length <= 1200,
    ),
  );
  assert.match(completedRevision?.contentUnits[0]?.content ?? "", /第1项/);
  assert.match(
    completedRevision?.contentUnits.at(-1)?.content ?? "",
    /第24项/,
  );
});

test("短小但有效的事实段落不会因长度被丢弃", async () => {
  let completedRevision: CompletedKnowledgeRevision | undefined;

  await processManualKnowledgeRevision(
    {
      id: "revision-short-fact",
      title: "售后政策",
      body: [
        "## 退款",
        "",
        "支持退款。",
        "",
        "管理员会核查提交信息与原始来源，并在确认符合演示售后政策后提供下一步处理说明。处理结果会保留清楚的知识版本和内容单元状态，方便后续核查。",
      ].join("\n"),
    },
    {
      embeddingProvider: {
        async embed(texts) {
          return texts.map(() => [0.1, 0.2]);
        },
      },
      revisionRepository: {
        async complete(revision) {
          completedRevision = revision;
        },
        async fail() {
          assert.fail("包含有效事实的正文不应处理失败");
        },
      },
    },
  );

  assert.ok(
    completedRevision?.contentUnits.some(({ content }) =>
      content.includes("支持退款。"),
    ),
  );
});

test("普通标题与无空行 Markdown 标题都形成内容单元边界", async () => {
  let completedRevision: CompletedKnowledgeRevision | undefined;

  await processManualKnowledgeRevision(
    {
      id: "revision-heading-boundaries",
      title: "业务说明",
      body: [
        "服务范围",
        "我们提供知识整理、来源核查与有据回答配置，管理员可以持续维护完整业务内容。",
        "## 响应方式",
        "工作日问题会在两个工作小时内确认，紧急情况请使用原始知识来源中列出的人工联系入口。",
      ].join("\n"),
    },
    {
      embeddingProvider: {
        async embed(texts) {
          return texts.map(() => [0.1, 0.2]);
        },
      },
      revisionRepository: {
        async complete(revision) {
          completedRevision = revision;
        },
        async fail() {
          assert.fail("有效标题与正文不应处理失败");
        },
      },
    },
  );

  assert.equal(completedRevision?.contentUnits.length, 2);
  assert.equal(completedRevision?.contentUnits[0]?.heading, "服务范围");
  assert.match(completedRevision?.contentUnits[0]?.content ?? "", /知识整理/);
  assert.equal(completedRevision?.contentUnits[1]?.heading, "响应方式");
  assert.match(
    completedRevision?.contentUnits[1]?.content ?? "",
    /两个工作小时/,
  );
});

test("标题后的连续短正文行不会被误判为新标题", async () => {
  let completedRevision: CompletedKnowledgeRevision | undefined;

  await processManualKnowledgeRevision(
    {
      id: "revision-short-lines",
      title: "退款政策",
      body: [
        "服务范围",
        "支持退款",
        "请在七日内提交申请。管理员会核查原始来源、订单状态和演示售后政策，再提供清楚的下一步处理说明。处理结果会保留完整知识版本和内容单元状态，方便管理员后续核查。",
      ].join("\n"),
    },
    {
      embeddingProvider: {
        async embed(texts) {
          return texts.map(() => [0.1, 0.2]);
        },
      },
      revisionRepository: {
        async complete(revision) {
          completedRevision = revision;
        },
        async fail() {
          assert.fail("有效标题与连续正文不应处理失败");
        },
      },
    },
  );

  assert.equal(completedRevision?.contentUnits.length, 1);
  assert.equal(completedRevision?.contentUnits[0]?.heading, "服务范围");
  assert.match(completedRevision?.contentUnits[0]?.content ?? "", /支持退款/);
});
