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
  await expect(metricCard(page, "待处理问题")).toContainText("02");

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
  await expect(
    conversationList.getByText("有据回答", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText("可靠拒答", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText("技术故障", { exact: true }),
  ).toBeVisible();

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

  await conversationList
    .getByRole("link", { name: /触发系统错误的问题/ })
    .click();
  await expect(page.getByText("技术故障", { exact: true })).toBeVisible();
  await expect(page.getByText("未创建待解决问题")).toBeVisible();

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

  const { error: sourceDeleteError } = await administratorClient
    .from("knowledge_sources")
    .delete()
    .eq("id", sourceId);
  expect(sourceDeleteError).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("link", { name: /生成时保存的标题/ }),
  ).toHaveAttribute("href", "https://example.com/snapshot");

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
  ]);
  expect([
    messagesResult.count,
    citationsResult.count,
    feedbackResult.count,
    unresolvedResult.count,
  ]).toEqual([0, 0, 0, 0]);

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
    .insert({
      id: sourceId,
      organization_id: organizationId,
      title: "稍后删除的知识来源",
      source_type: "manual",
      status: "available",
      enabled: true,
    });
  expect(sourceError).toBeNull();

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
        message_type: "grounded_answer",
        content: "最近的有据回答",
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

  const { error: citationError } = await administratorClient
    .from("citations")
    .insert({
      id: "00000000-0000-4000-8000-000000000601",
      organization_id: organizationId,
      conversation_id: answerConversationId,
      message_id: "00000000-0000-4000-8000-000000000504",
      knowledge_source_id: sourceId,
      source_title: "生成时保存的标题",
      source_url: "https://example.com/snapshot",
    });
  expect(citationError).toBeNull();

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
}
