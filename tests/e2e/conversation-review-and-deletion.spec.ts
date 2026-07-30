import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

const organizationId = "00000000-0000-4000-8000-000000000101";
const assistantId = "00000000-0000-4000-8000-000000000201";
const answerConversationId = "00000000-0000-4000-8000-000000000401";
const refusalConversationId = "00000000-0000-4000-8000-000000000402";
const failureConversationId = "00000000-0000-4000-8000-000000000403";
const expiredConversationId = "00000000-0000-4000-8000-000000000404";
const sourceId = "00000000-0000-4000-8000-000000000301";
const revisionId = "00000000-0000-4000-8000-000000000302";
const contentUnitId = "00000000-0000-4000-8000-000000000303";
const factualRequestId = "00000000-0000-4000-8000-000000000701";
const conflictingSourceIds = [
  "00000000-0000-4000-8000-000000000311",
  "00000000-0000-4000-8000-000000000321",
];
const conflictingRevisionIds = [
  "00000000-0000-4000-8000-000000000312",
  "00000000-0000-4000-8000-000000000322",
];
const conflictingContentUnitIds = [
  "00000000-0000-4000-8000-000000000313",
  "00000000-0000-4000-8000-000000000323",
];
const unsupportedFactualRequestId =
  "00000000-0000-4000-8000-000000000702";
const conflictingFactualRequestId =
  "00000000-0000-4000-8000-000000000703";
const assistantPublicId = "00000000-0000-4000-8000-000000000210";

type MailpitMessage = {
  ID: string;
  To: Array<{ Address: string }>;
};

async function getMailpitMessages(request: APIRequestContext) {
  const response = await request.get("http://127.0.0.1:54324/api/v1/messages");

  return (await response.json()) as {
    total: number;
    messages: MailpitMessage[];
  };
}

async function signInAsAdministrator(page: Page, request: APIRequestContext) {
  const messagesBefore = await getMailpitMessages(request);
  const existingMessageIds = new Set(
    messagesBefore.messages.map(({ ID }) => ID),
  );

  await page.goto("/login");
  await page.waitForTimeout(1_100);
  await page.getByRole("button", { name: "发送 Magic Link" }).click();
  await expect(page.getByRole("status")).toContainText("登录链接已发送");

  await expect
    .poll(async () => {
      const payload = await getMailpitMessages(request);
      return payload.total;
    })
    .toBeGreaterThan(messagesBefore.total);

  const messages = await getMailpitMessages(request);
  const message = messages.messages.find(
    (candidate) =>
      !existingMessageIds.has(candidate.ID) &&
      candidate.To.some(
        ({ Address }) => Address === "admin@groundeddesk.local",
      ),
  );

  expect(message).toBeDefined();

  const messageResponse = await request.get(
    `http://127.0.0.1:54324/api/v1/message/${message?.ID}`,
  );
  const messageBody = (await messageResponse.json()) as { HTML: string };
  const magicLink = messageBody.HTML.match(/href="([^"]+token_hash[^"]+)"/)?.[1];

  expect(magicLink).toBeDefined();
  await page.goto(magicLink!);
  await expect(page).toHaveURL(/\/admin$/);
}

test("管理员复盘最近会话、保留引用快照并确认删除关联数据", async ({
  page,
  request,
}) => {
  const { administratorClient, privilegedClient } =
    await createAdministratorDataClient();
  await seedConversationReviewScenario(
    administratorClient,
    privilegedClient,
  );
  await signInAsAdministrator(page, request);

  await page.goto("/admin");
  await expect(metricCard(page, "最近 30 天会话")).toContainText("03");
  await expect(metricCard(page, "待处理问题")).toContainText("04");

  await page.goto("/admin/conversations");
  await expect(page.getByRole("heading", { name: "会话" })).toBeVisible();
  const conversationList = page.getByRole("complementary", {
    name: "会话列表",
  });
  await expect(
    conversationList.getByText("最初的问题", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText("知识范围外的问题", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText("触发系统错误的问题", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText("过期会话的问题", { exact: true }),
  ).toHaveCount(0);
  const resultFilters = page.getByRole("navigation", {
    name: "会话结果筛选",
  });
  for (const label of [
    "有据回答",
    "部分有据回答",
    "知识冲突",
    "交流性回应",
    "澄清提问",
    "人工接续",
    "可靠拒答",
    "技术故障",
  ]) {
    await expect(
      resultFilters.getByRole("link", { name: new RegExp(`^${label} `) }),
    ).toBeVisible();
  }
  await expect(
    conversationList.getByText("部分有据回答", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList
      .getByRole("link", { name: /最初的问题/ })
      .getByText("没帮助", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText("可靠拒答", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText("技术故障", { exact: true }),
  ).toBeVisible();
  const failureConversationLink = conversationList.getByRole("link", {
    name: /触发系统错误的问题/,
  });
  await expect(
    failureConversationLink.getByText("尚无质量反馈", { exact: true }),
  ).toHaveCount(0);

  await page.getByLabel("搜索提问摘要").fill("系统错误");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(
    conversationList.getByText("知识范围外的问题", { exact: true }),
  ).toHaveCount(0);
  await expect(
    conversationList.getByText("触发系统错误的问题", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("搜索提问摘要").fill("");
  await page.getByRole("button", { name: "搜索" }).click();

  await conversationList
    .getByRole("link", { name: /知识范围外的问题/ })
    .click();
  await expect(page.getByText("可靠拒答", { exact: true })).toBeVisible();
  await expect(
    page.getByText("现有知识暂时无法确认。", { exact: true }),
  ).toBeVisible();

  await failureConversationLink.click();
  await expect(page.getByText("技术故障", { exact: true })).toBeVisible();
  await expect(page.getByText("未创建待解决问题")).toBeVisible();
  await expect(page.getByRole("region", {
    name: "处理阶段审计",
  })).toContainText("消息映射：必要处理阶段失败，保留为技术故障");

  await conversationList
    .getByRole("link", { name: /最初的问题/ })
    .click();
  await expect(page.getByText("最初的问题", { exact: true })).toBeVisible();
  await expect(page.getByText("最近的问题", { exact: true })).toBeVisible();
  await expect(
    page.getByText("最近的有据回答", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("访客评价：没帮助")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /生成时保存的标题/ }),
  ).toHaveAttribute("href", "https://example.com/snapshot");
  await page.getByText("决策审计", { exact: true }).click();
  const decisionAudit = page.getByRole("region", {
    name: "结构化决策审计",
  });
  await expect(decisionAudit).toContainText(
    /1\. 最近的问题[\s\S]*2\. 上海有办公室吗[\s\S]*3\. 人工服务时间是什么/,
  );
  await expect(decisionAudit).toContainText("完整");
  await expect(decisionAudit).toContainText("已支持");
  await expect(decisionAudit).toContainText("无支持");
  await expect(decisionAudit).toContainText("知识冲突");
  await expect(
    decisionAudit.getByRole("region", { name: "事实诉求 2" }),
  ).toContainText("覆盖判定器 evidence-coverage-v1");
  await expect(decisionAudit).toContainText("这是判定时采用的连续原文片段。");
  await expect(decisionAudit).toContainText("人工服务时间为工作日 09:00–18:00。");
  await expect(decisionAudit).toContainText("人工服务时间为每日 08:00–20:00。");
  await expect(decisionAudit).toContainText("证据关系：支持");
  await expect(decisionAudit).toContainText("证据关系：冲突");
  await expect(decisionAudit).toContainText("审计说明：该片段直接回答事实诉求。");
  await expect(decisionAudit).toContainText("请求分析器 request-analysis-v1");
  await expect(decisionAudit).toContainText("覆盖判定器 evidence-coverage-v1");
  await expect(decisionAudit).toContainText("响应策略 response-strategy-v1");
  await expect(decisionAudit).toContainText(
    "消息映射：至少一项事实诉求获得支持，且另有未支持或未完成诉求",
  );
  const processingStages = decisionAudit.getByRole("region", {
    name: "处理阶段审计",
  });
  await expect(processingStages).toContainText("请求分析");
  await expect(processingStages).toContainText("问题向量");
  await expect(processingStages).toContainText("重排");
  await expect(processingStages).toContainText("证据覆盖");
  await expect(processingStages).toContainText("回答生成");
  await expect(processingStages).toContainText("诉求 1");
  await expect(processingStages).toContainText("analysis-trace");
  await expect(processingStages).toContainText("coverage-trace");
  await expect(processingStages).toContainText("成功");
  await expect(decisionAudit).not.toContainText("系统提示词");
  await expect(decisionAudit).not.toContainText("隐藏推理");
  await expect(
    decisionAudit.getByRole("link", { name: /无支持/ }),
  ).toHaveAttribute(
    "href",
    `/admin/unresolved-questions?status=pending&question=00000000-0000-4000-8000-000000000803`,
  );
  await expect(
    decisionAudit.getByRole("link", { name: /知识冲突/ }),
  ).toHaveAttribute(
    "href",
    `/admin/unresolved-questions?status=pending&question=00000000-0000-4000-8000-000000000804`,
  );
  await expect(
    decisionAudit.getByRole("link", { name: /没帮助/ }),
  ).toBeVisible();

  const { error: sourceDeleteError } = await administratorClient
    .from("knowledge_sources")
    .delete()
    .in("id", [sourceId, ...conflictingSourceIds]);
  expect(sourceDeleteError).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("link", { name: /生成时保存的标题/ }),
  ).toHaveAttribute("href", "https://example.com/snapshot");
  await page.getByText("决策审计", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "结构化决策审计" }),
  ).toContainText("冲突知识快照 A");

  await page.getByRole("button", { name: "删除会话" }).click();
  await expect(
    page.getByRole("alertdialog").getByRole("heading", {
      name: "永久删除会话",
    }),
  ).toBeVisible();
  await expect(page.getByRole("alertdialog")).toContainText(
    "消息、引用、质量反馈和关联待解决问题",
  );
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/conversations\\?conversation=${answerConversationId}`),
  );

  await page.getByRole("button", { name: "删除会话" }).click();
  await page.getByRole("button", { name: "确认永久删除" }).click();
  await expect(page).toHaveURL(/\/admin\/conversations$/);
  await expect(
    conversationList.getByText("最初的问题", { exact: true }),
  ).toHaveCount(0);
  await expect(
    conversationList.getByText("知识范围外的问题", { exact: true }),
  ).toBeVisible();

  const [
    messagesResult,
    citationsResult,
    feedbackResult,
    unresolvedResult,
    factualRequestsResult,
    evidenceSnapshotsResult,
    callLogsResult,
  ] = await Promise.all([
    administratorClient
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", answerConversationId),
    administratorClient
      .from("citations")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", answerConversationId),
    administratorClient
      .from("quality_feedback")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", answerConversationId),
    administratorClient
      .from("unresolved_questions")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", answerConversationId),
    administratorClient
      .from("message_factual_requests")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", answerConversationId),
    administratorClient
      .from("evidence_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", answerConversationId),
    administratorClient
      .from("ai_call_logs")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", answerConversationId),
  ]);
  expect([
    messagesResult.count,
    citationsResult.count,
    feedbackResult.count,
    unresolvedResult.count,
    factualRequestsResult.count,
    evidenceSnapshotsResult.count,
    callLogsResult.count,
  ]).toEqual([0, 0, 0, 0, 0, 0, 0]);

  await page.goto("/admin");
  await expect(metricCard(page, "最近 30 天会话")).toContainText("02");
  await expect(metricCard(page, "待处理问题")).toContainText("01");

  const { error: conversationCleanupError } = await administratorClient
    .from("conversations")
    .delete()
    .in("id", [
      refusalConversationId,
      failureConversationId,
      expiredConversationId,
    ]);
  expect(conversationCleanupError).toBeNull();

  const { error: assistantCleanupError } = await administratorClient
    .from("assistants")
    .update({
      public_id: null,
      status: "draft",
    })
    .eq("id", assistantId);
  expect(assistantCleanupError).toBeNull();
});

function metricCard(page: Page, label: string) {
  return page.getByRole("article").filter({ hasText: label });
}

async function createAdministratorDataClient() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    process.loadEnvFile(".env.local");
  }

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
  expect(secretKey).toBeTruthy();

  const privilegedClient = createClient(url, secretKey!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data: linkData, error: linkError } =
    await privilegedClient.auth.admin.generateLink({
      email: "admin@groundeddesk.local",
      type: "magiclink",
    });
  expect(linkError).toBeNull();
  const hashedToken = linkData.properties?.hashed_token;
  expect(hashedToken).toBeTruthy();

  const administratorClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { error: verifyError } = await administratorClient.auth.verifyOtp({
    token_hash: hashedToken!,
    type: "email",
  });
  expect(verifyError).toBeNull();

  return { administratorClient, privilegedClient };
}

async function seedConversationReviewScenario(
  administratorClient: SupabaseClient,
  privilegedClient: SupabaseClient,
) {
  const now = Date.now();
  const minutesAgo = (minutes: number) =>
    new Date(now - minutes * 60_000).toISOString();
  const daysAgo = (days: number) =>
    new Date(now - days * 24 * 60 * 60_000).toISOString();

  const { error: assistantError } = await administratorClient
    .from("assistants")
    .update({
      public_id: assistantPublicId,
      status: "published",
    })
    .eq("id", assistantId);
  expect(assistantError).toBeNull();

  const { error: sourceError } = await administratorClient
    .from("knowledge_sources")
    .insert([
      {
        id: sourceId,
        organization_id: organizationId,
        title: "稍后删除的知识来源",
        source_type: "manual",
        status: "available",
        enabled: true,
      },
      ...conflictingSourceIds.map((id, index) => ({
        id,
        organization_id: organizationId,
        title: `冲突知识来源 ${index + 1}`,
        source_type: "manual",
        status: "available",
        enabled: true,
      })),
    ]);
  expect(sourceError).toBeNull();

  const { error: revisionError } = await administratorClient
    .from("knowledge_revisions")
    .insert({
      id: revisionId,
      organization_id: organizationId,
      knowledge_source_id: sourceId,
      title: "判定时知识版本",
      body: "这是判定时采用的连续原文片段。",
      status: "available",
      completed_at: minutesAgo(70),
    });
  expect(revisionError).toBeNull();

  const { error: conflictingRevisionsError } = await administratorClient
    .from("knowledge_revisions")
    .insert(
      conflictingRevisionIds.map((id, index) => ({
        id,
        organization_id: organizationId,
        knowledge_source_id: conflictingSourceIds[index],
        title: `冲突知识版本 ${index + 1}`,
        body: index === 0
          ? "人工服务时间为工作日 09:00–18:00。"
          : "人工服务时间为每日 08:00–20:00。",
        status: "available",
        completed_at: minutesAgo(70),
      })),
    );
  expect(conflictingRevisionsError).toBeNull();

  const { error: contentUnitError } = await administratorClient
    .from("content_units")
    .insert({
      id: contentUnitId,
      organization_id: organizationId,
      knowledge_source_id: sourceId,
      knowledge_revision_id: revisionId,
      position: 0,
      heading: "复盘证据",
      content: "这是判定时采用的连续原文片段。",
      embedding: Array.from({ length: 1_024 }, () => 0),
    });
  expect(contentUnitError).toBeNull();

  const { error: conflictingContentUnitsError } = await administratorClient
    .from("content_units")
    .insert(
      conflictingContentUnitIds.map((id, index) => ({
        id,
        organization_id: organizationId,
        knowledge_source_id: conflictingSourceIds[index],
        knowledge_revision_id: conflictingRevisionIds[index],
        position: 0,
        heading: `冲突知识快照 ${index === 0 ? "A" : "B"}`,
        content: index === 0
          ? "人工服务时间为工作日 09:00–18:00。"
          : "人工服务时间为每日 08:00–20:00。",
        embedding: Array.from({ length: 1_024 }, () => 0),
      })),
    );
  expect(conflictingContentUnitsError).toBeNull();

  const { error: currentRevisionError } = await administratorClient
    .from("knowledge_sources")
    .update({ current_revision_id: revisionId })
    .eq("id", sourceId);
  expect(currentRevisionError).toBeNull();
  for (const [index, id] of conflictingSourceIds.entries()) {
    const { error: conflictingCurrentRevisionError } =
      await administratorClient
        .from("knowledge_sources")
        .update({ current_revision_id: conflictingRevisionIds[index] })
        .eq("id", id);
    expect(conflictingCurrentRevisionError).toBeNull();
  }

  const { error: conversationsError } = await administratorClient
    .from("conversations")
    .insert([
      {
        id: answerConversationId,
        organization_id: organizationId,
        assistant_id: assistantId,
        visitor_session_id: "00000000-0000-4000-8000-000000000411",
        created_at: minutesAgo(60),
        last_activity_at: minutesAgo(30),
      },
      {
        id: refusalConversationId,
        organization_id: organizationId,
        assistant_id: assistantId,
        visitor_session_id: "00000000-0000-4000-8000-000000000412",
        created_at: minutesAgo(120),
        last_activity_at: minutesAgo(90),
      },
      {
        id: failureConversationId,
        organization_id: organizationId,
        assistant_id: assistantId,
        visitor_session_id: "00000000-0000-4000-8000-000000000413",
        created_at: minutesAgo(180),
        last_activity_at: minutesAgo(150),
      },
      {
        id: expiredConversationId,
        organization_id: organizationId,
        assistant_id: assistantId,
        visitor_session_id: "00000000-0000-4000-8000-000000000414",
        created_at: daysAgo(31),
        last_activity_at: daysAgo(31),
      },
    ]);
  expect(conversationsError).toBeNull();

  const { error: messagesError } = await administratorClient
    .from("messages")
    .insert([
      {
        id: "00000000-0000-4000-8000-000000000501",
        organization_id: organizationId,
        conversation_id: answerConversationId,
        message_type: "visitor_question",
        content: "最初的问题",
        status: "completed",
        created_at: minutesAgo(55),
      },
      {
        id: "00000000-0000-4000-8000-000000000502",
        organization_id: organizationId,
        conversation_id: answerConversationId,
        message_type: "grounded_answer",
        content: "最初的有据回答",
        status: "completed",
        created_at: minutesAgo(50),
      },
      {
        id: "00000000-0000-4000-8000-000000000503",
        organization_id: organizationId,
        conversation_id: answerConversationId,
        message_type: "visitor_question",
        content: "最近的问题",
        status: "completed",
        created_at: minutesAgo(35),
      },
      {
        id: "00000000-0000-4000-8000-000000000504",
        organization_id: organizationId,
        conversation_id: answerConversationId,
        message_type: "partially_grounded_answer",
        content: [
          "最近的有据回答",
          "现有知识暂时无法确认上海办公室信息。",
          "现有知识对人工服务时间存在冲突。",
        ].join("\n\n"),
        status: "completed",
        created_at: minutesAgo(30),
      },
      {
        id: "00000000-0000-4000-8000-000000000511",
        organization_id: organizationId,
        conversation_id: refusalConversationId,
        message_type: "visitor_question",
        content: "知识范围外的问题",
        status: "completed",
        created_at: minutesAgo(100),
      },
      {
        id: "00000000-0000-4000-8000-000000000512",
        organization_id: organizationId,
        conversation_id: refusalConversationId,
        message_type: "grounded_refusal",
        content: "现有知识暂时无法确认。",
        status: "completed",
        created_at: minutesAgo(90),
      },
      {
        id: "00000000-0000-4000-8000-000000000521",
        organization_id: organizationId,
        conversation_id: failureConversationId,
        message_type: "visitor_question",
        content: "触发系统错误的问题",
        status: "completed",
        created_at: minutesAgo(160),
      },
      {
        id: "00000000-0000-4000-8000-000000000522",
        organization_id: organizationId,
        conversation_id: failureConversationId,
        message_type: "technical_failure",
        content: "服务暂时不可用，请稍后重试。",
        status: "failed",
        created_at: minutesAgo(150),
      },
      {
        id: "00000000-0000-4000-8000-000000000531",
        organization_id: organizationId,
        conversation_id: expiredConversationId,
        message_type: "visitor_question",
        content: "过期会话的问题",
        status: "completed",
        created_at: daysAgo(31),
      },
    ]);
  expect(messagesError).toBeNull();

  const { error: factualRequestError } = await privilegedClient
    .from("message_factual_requests")
    .insert([
      {
        id: factualRequestId,
        organization_id: organizationId,
        conversation_id: answerConversationId,
        visitor_message_id: "00000000-0000-4000-8000-000000000503",
        assistant_message_id: "00000000-0000-4000-8000-000000000504",
        request_order: 1,
        original_text: "最近的问题",
        normalized_question: "最近的问题",
        completeness: "complete",
        coverage_status: "supported",
        missing_information: [],
        clarification_round: 0,
        request_analysis_version: "request-analysis-v1",
        response_strategy_version: "response-strategy-v1",
        response_content: "最近的有据回答",
        response_status: "supported",
      },
      {
        id: unsupportedFactualRequestId,
        organization_id: organizationId,
        conversation_id: answerConversationId,
        visitor_message_id: "00000000-0000-4000-8000-000000000503",
        assistant_message_id: "00000000-0000-4000-8000-000000000504",
        request_order: 2,
        original_text: "上海有办公室吗",
        normalized_question: "上海有办公室吗",
        completeness: "complete",
        coverage_status: "unsupported",
        missing_information: [],
        clarification_round: 0,
        request_analysis_version: "request-analysis-v1",
        response_strategy_version: "response-strategy-v1",
        response_content: "现有知识暂时无法确认上海办公室信息。",
        response_status: "unsupported",
      },
      {
        id: conflictingFactualRequestId,
        organization_id: organizationId,
        conversation_id: answerConversationId,
        visitor_message_id: "00000000-0000-4000-8000-000000000503",
        assistant_message_id: "00000000-0000-4000-8000-000000000504",
        request_order: 3,
        original_text: "人工服务时间是什么",
        normalized_question: "人工服务时间是什么",
        completeness: "complete",
        coverage_status: "conflicting",
        missing_information: [],
        clarification_round: 0,
        request_analysis_version: "request-analysis-v1",
        response_strategy_version: "response-strategy-v1",
        response_content: "现有知识对人工服务时间存在冲突。",
        response_status: "conflicting",
      },
    ]);
  expect(factualRequestError).toBeNull();

  const { error: evidenceSnapshotError } = await privilegedClient
    .from("evidence_snapshots")
    .insert({
      organization_id: organizationId,
      conversation_id: answerConversationId,
      factual_request_id: factualRequestId,
      content_unit_id: contentUnitId,
      knowledge_source_id: sourceId,
      source_title: "生成时保存的标题",
      source_url: "https://example.com/snapshot",
      relationship: "supports",
      exact_excerpt: "这是判定时采用的连续原文片段。",
      decision_reason: "该片段直接回答事实诉求。",
      coverage_decision_version: "evidence-coverage-v1",
    });
  expect(evidenceSnapshotError).toBeNull();

  const { error: conflictingSnapshotsError } = await privilegedClient
    .from("evidence_snapshots")
    .insert(
      conflictingContentUnitIds.map((id, index) => ({
        organization_id: organizationId,
        conversation_id: answerConversationId,
        factual_request_id: conflictingFactualRequestId,
        content_unit_id: id,
        knowledge_source_id: conflictingSourceIds[index],
        source_title: `冲突知识快照 ${index === 0 ? "A" : "B"}`,
        source_url: `https://example.com/conflict-${index + 1}`,
        relationship: "conflicts",
        exact_excerpt: index === 0
          ? "人工服务时间为工作日 09:00–18:00。"
          : "人工服务时间为每日 08:00–20:00。",
        decision_reason: "相同服务范围下的时间说明无法同时成立。",
        coverage_decision_version: "evidence-coverage-v1",
      })),
    );
  expect(conflictingSnapshotsError).toBeNull();

  const { error: citationError } = await administratorClient
    .from("citations")
    .insert([
      {
        id: "00000000-0000-4000-8000-000000000601",
        organization_id: organizationId,
        conversation_id: answerConversationId,
        message_id: "00000000-0000-4000-8000-000000000504",
        factual_request_id: factualRequestId,
        knowledge_source_id: sourceId,
        source_title: "生成时保存的标题",
        source_url: "https://example.com/snapshot",
      },
      ...conflictingSourceIds.map((knowledgeSourceId, index) => ({
        id: `00000000-0000-4000-8000-00000000061${index + 1}`,
        organization_id: organizationId,
        conversation_id: answerConversationId,
        message_id: "00000000-0000-4000-8000-000000000504",
        factual_request_id: conflictingFactualRequestId,
        knowledge_source_id: knowledgeSourceId,
        source_title: `冲突知识快照 ${index === 0 ? "A" : "B"}`,
        source_url: `https://example.com/conflict-${index + 1}`,
      })),
    ]);
  expect(citationError).toBeNull();

  const callStages = [
    {
      call_type: "request_analysis",
      factual_request_id: null,
      model: "request-analysis-v1",
      trace_id: "analysis-trace",
    },
    {
      call_type: "embedding",
      factual_request_id: factualRequestId,
      model: "embedding-v1",
      trace_id: "embedding-trace",
    },
    {
      call_type: "rerank",
      factual_request_id: factualRequestId,
      model: "rerank-v1",
      trace_id: "rerank-trace",
    },
    {
      call_type: "evidence_coverage",
      factual_request_id: factualRequestId,
      model: "coverage-v1",
      trace_id: "coverage-trace",
    },
    {
      call_type: "answer",
      factual_request_id: factualRequestId,
      model: "answer-v1",
      trace_id: "answer-trace",
    },
  ];
  for (const [index, stage] of callStages.entries()) {
    const { error: callLogError } = await privilegedClient.rpc(
      "record_public_assistant_ai_call",
      {
        assistant_public_id: assistantPublicId,
        logged_call_type: stage.call_type,
        logged_provider: "test",
        logged_model: stage.model,
        logged_input_tokens: 10,
        logged_output_tokens: 2,
        logged_total_tokens: 12,
        logged_duration_ms: 20 + index,
        logged_outcome: "success",
        logged_error_type: null,
        logged_trace_id: stage.trace_id,
        target_conversation_id: answerConversationId,
        target_assistant_message_id:
          "00000000-0000-4000-8000-000000000504",
        target_factual_request_id: stage.factual_request_id,
      },
    );
    expect(callLogError).toBeNull();
  }

  const { error: failureCallLogError } = await privilegedClient.rpc(
    "record_public_assistant_ai_call",
    {
      assistant_public_id: assistantPublicId,
      logged_call_type: "request_analysis",
      logged_provider: "test",
      logged_model: "request-analysis-v1",
      logged_input_tokens: 0,
      logged_output_tokens: 0,
      logged_total_tokens: 0,
      logged_duration_ms: 35,
      logged_outcome: "error",
      logged_error_type: "timeout",
      logged_trace_id: "technical-failure-trace",
      target_conversation_id: failureConversationId,
      target_assistant_message_id:
        "00000000-0000-4000-8000-000000000522",
      target_factual_request_id: null,
    },
  );
  expect(failureCallLogError).toBeNull();

  const { error: feedbackError } = await privilegedClient.rpc(
    "submit_public_quality_feedback",
    {
      assistant_public_id: assistantPublicId,
      target_answer_message_id: "00000000-0000-4000-8000-000000000504",
      submitted_feedback_value: "unhelpful",
    },
  );
  expect(feedbackError).toBeNull();

  const { error: unresolvedError } = await administratorClient
    .from("unresolved_questions")
    .insert({
      id: "00000000-0000-4000-8000-000000000802",
      organization_id: organizationId,
      conversation_id: refusalConversationId,
      question_message_id: "00000000-0000-4000-8000-000000000511",
      answer_message_id: "00000000-0000-4000-8000-000000000512",
      question: "知识范围外的问题",
      answer_content: "现有知识暂时无法确认。",
      citations: [],
      trigger_type: "grounded_refusal",
      status: "pending",
    });
  expect(unresolvedError).toBeNull();

  const { error: multiRequestUnresolvedError } = await administratorClient
    .from("unresolved_questions")
    .insert([
      {
        id: "00000000-0000-4000-8000-000000000803",
        organization_id: organizationId,
        conversation_id: answerConversationId,
        question_message_id: "00000000-0000-4000-8000-000000000503",
        answer_message_id: "00000000-0000-4000-8000-000000000504",
        factual_request_id: unsupportedFactualRequestId,
        question: "上海有办公室吗",
        answer_content: "现有知识暂时无法确认上海办公室信息。",
        citations: [],
        trigger_type: "unsupported_factual_request",
        status: "pending",
      },
      {
        id: "00000000-0000-4000-8000-000000000804",
        organization_id: organizationId,
        conversation_id: answerConversationId,
        question_message_id: "00000000-0000-4000-8000-000000000503",
        answer_message_id: "00000000-0000-4000-8000-000000000504",
        factual_request_id: conflictingFactualRequestId,
        question: "人工服务时间是什么",
        answer_content: "现有知识对人工服务时间存在冲突。",
        citations: [],
        trigger_type: "knowledge_conflict",
        status: "pending",
      },
    ]);
  expect(multiRequestUnresolvedError).toBeNull();
}
