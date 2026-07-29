import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

test("管理员发布后访客可匿名连续咨询、重试并在下线后停止服务", async ({
  page,
  request,
}) => {
  const scenarioId = Date.now();
  const sourceTitle = `公开咨询服务说明 ${scenarioId}`;
  const sourceMarker = `PUBLIC-SERVICE-${scenarioId}-`.repeat(16);

  await signInAsAdministrator(page, request);
  await page.goto("/admin/assistant");

  await expect(page.getByText("草稿", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("公开会话链接")).toHaveCount(0);

  await page.getByLabel("助手名称").fill("演示业务顾问");
  await page
    .getByLabel("欢迎语")
    .fill("你好，我可以帮助你核查演示业务的服务与支持方式。");
  await page.getByLabel("人工联系入口文案").fill("联系业务团队");
  await page
    .getByLabel("人工联系 URL")
    .fill("https://example.com/contact");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status")).toContainText("助手配置已保存");

  await page.getByRole("link", { name: "知识来源", exact: true }).click();
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();
  await page.getByLabel("标题", { exact: true }).fill(sourceTitle);
  await page
    .getByLabel("正文", { exact: true })
    .fill(
      [
        `${sourceMarker} ${sourceMarker} ${sourceMarker}`,
        "",
        "## 服务范围",
        "",
        "演示组织提供知识整理、来源核查和有据回答配置服务，帮助团队把已维护的业务内容转化为可核查的访客回答。",
        "",
        "每条事实性回答都需要现有知识支持；知识不足时，助手会可靠拒答并提供人工联系入口。",
      ].join("\n"),
    );
  await page
    .getByLabel("原始 URL（可选）", { exact: true })
    .fill("https://example.com/public-services");
  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: sourceTitle });
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });

  await page.getByRole("link", { name: "助手", exact: true }).click();
  await page.getByRole("button", { name: "发布助手" }).click();

  await expect(page.getByText("已发布", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("公开会话链接")).toBeVisible();
  const publicLink = page.getByRole("link", { name: "打开公开页面" });
  const publicUrl = await publicLink.getAttribute("href");
  expect(publicUrl).toMatch(
    /^http:\/\/127\.0\.0\.1:3000\/a\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  const publicPath = new URL(publicUrl!).pathname;
  await expect(
    page.getByRole("button", { name: "复制公开链接" }),
  ).toBeVisible();

  await page.goto(publicPath);
  await expect(
    page.getByRole("heading", { name: "演示业务顾问" }),
  ).toBeVisible();
  await expect(
    page.getByText("你好，我可以帮助你核查演示业务的服务与支持方式。"),
  ).toBeVisible();
  await expect(page.getByText("AI 助手", { exact: true })).toBeVisible();
  await expect(page.getByText(/请勿提交敏感个人信息/)).toBeVisible();
  await expect(page.getByLabel("姓名")).toHaveCount(0);
  await expect(page.getByLabel("邮箱")).toHaveCount(0);
  await expect(page.getByLabel("电话")).toHaveCount(0);

  const publicMessageRequests: Array<{
    question: string;
    conversationId?: string;
    retry?: boolean;
  }> = [];
  page.on("request", (browserRequest) => {
    if (
      browserRequest.method() === "POST" &&
      browserRequest.url().includes("/api/public/assistants/")
    ) {
      const payload = browserRequest.postDataJSON() as {
        question: string;
        conversationId?: string;
        retry?: boolean;
      };
      publicMessageRequests.push(payload);
    }
  });

  await page
    .getByLabel("咨询问题")
    .fill(`${sourceMarker} 你们提供什么服务？`);
  await page.getByRole("button", { name: "发送问题" }).click();

  await expect(
    page.getByText(/根据当前可用知识/),
  ).toBeVisible();
  await expect(page.getByText("回答依据", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(sourceTitle) }),
  ).toHaveAttribute("href", "https://example.com/public-services");

  await page.getByLabel("咨询问题").fill("它包含实施支持吗？");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText("它包含实施支持吗？", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/根据当前可用知识/)).toHaveCount(2);
  await expect(page.getByLabel("咨询问题")).toBeEnabled();
  expect(publicMessageRequests.slice(0, 2)).toEqual([
    {
      question: `${sourceMarker} 你们提供什么服务？`,
    },
    {
      question: "它包含实施支持吗？",
      conversationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      ),
    },
  ]);

  let retryAttempts = 0;
  await page.route(
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
    async (route) => {
      retryAttempts += 1;
      await route.fulfill({
        body:
          retryAttempts === 1
            ? `${JSON.stringify({
                type: "temporary_failure",
                reason: "provider_failure",
                message: "供应商服务暂时不可用，请稍后重试。",
                retryable: true,
                contact: {
                  label: "联系业务团队",
                  url: "https://example.com/contact",
                },
              })}\n`
            : [
                JSON.stringify({
                  type: "text_delta",
                  delta: "重试后得到有据回答。",
                }),
                JSON.stringify({
                  type: "complete",
                  citations: [],
                }),
                "",
              ].join("\n"),
        contentType: "application/x-ndjson; charset=utf-8",
        headers: {
          "x-conversation-id":
            "00000000-0000-4000-8000-000000000402",
        },
        status: 200,
      });
    },
  );
  await page.reload();
  await page.getByLabel("咨询问题").fill("请重试这个问题");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText("请重试这个问题", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("服务暂时不可用", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("现有知识暂时无法确认", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.getByText("重试后得到有据回答。", { exact: true }),
  ).toBeVisible();
  expect(
    publicMessageRequests.filter(
      ({ question }) => question === "请重试这个问题",
    ),
  ).toEqual([
    {
      question: "请重试这个问题",
    },
    {
      question: "请重试这个问题",
      conversationId: "00000000-0000-4000-8000-000000000402",
      retry: true,
    },
  ]);
  await page.unroute(
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
  );

  let rateLimitAttempts = 0;
  await page.route(
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
    async (route) => {
      rateLimitAttempts += 1;
      await route.fulfill(
        rateLimitAttempts === 1
          ? {
              body: JSON.stringify({
                code: "rate_limited",
                message:
                  "当前会话每分钟最多发送五条消息，请稍后再试。",
                conversationId:
                  "00000000-0000-4000-8000-000000000402",
                canStartNewConversation: false,
                contact: {
                  label: "联系业务团队",
                  url: "https://example.com/contact",
                },
              }),
              contentType: "application/json",
              status: 429,
            }
          : {
              body: [
                JSON.stringify({
                  type: "text_delta",
                  delta: "限流恢复后重新提交成功。",
                }),
                JSON.stringify({
                  type: "complete",
                  citations: [],
                }),
                "",
              ].join("\n"),
              contentType: "application/x-ndjson; charset=utf-8",
              status: 200,
            },
      );
    },
  );
  await page.getByLabel("咨询问题").fill("限流后重新提交");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText(
      "当前会话每分钟最多发送五条消息，请稍后再试。",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.getByText("限流恢复后重新提交成功。", { exact: true }),
  ).toBeVisible();
  expect(
    publicMessageRequests.filter(
      ({ question }) => question === "限流后重新提交",
    ),
  ).toEqual([
    {
      question: "限流后重新提交",
      conversationId: "00000000-0000-4000-8000-000000000402",
    },
    {
      question: "限流后重新提交",
      conversationId: "00000000-0000-4000-8000-000000000402",
    },
  ]);
  await page.unroute(
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
  );

  await page.route(
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: "question_limit",
          message: "当前会话已达到三十个问题的上限，请开始新会话。",
          conversationId: "00000000-0000-4000-8000-000000000401",
          canStartNewConversation: true,
          contact: {
            label: "联系业务团队",
            url: "https://example.com/contact",
          },
        }),
        contentType: "application/json",
        status: 409,
      });
    },
  );
  await page.getByLabel("咨询问题").fill("达到上限的问题");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText(
      "当前会话已达到三十个问题的上限，请开始新会话。",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "开始新会话" }).click();
  await expect(page.getByText("达到上限的问题")).toHaveCount(0);
  await expect(page.getByLabel("咨询问题")).toBeEnabled();
  await page.unroute(
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
  );

  await page.route(
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
    async (route) => {
      await route.fulfill({
        body: `${JSON.stringify({
          type: "refusal",
          message: "当前可用知识不足以支持这个问题的事实性回答。",
          contact: {
            label: "联系业务团队",
            url: "https://example.com/contact",
          },
        })}\n`,
        contentType: "application/x-ndjson; charset=utf-8",
        status: 200,
      });
    },
  );
  await page.reload();
  await page.getByLabel("咨询问题").fill("你们在上海有办公室吗？");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText("现有知识暂时无法确认", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "联系业务团队" }),
  ).toHaveAttribute("href", "https://example.com/contact");
  await page.unroute(
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
  );

  await page.goto("/admin/assistant");
  await page.getByRole("button", { name: "下线助手" }).click();
  await expect(page.getByText("已下线", { exact: true }).first()).toBeVisible();

  const messageResponse = await request.post(
    `/api/public/assistants/${publicPath.split("/").at(-1)}/messages`,
    {
      data: { question: "下线后不应接受这个问题" },
    },
  );
  expect(messageResponse.status()).toBe(404);

  await page.goto(publicPath);
  await expect(
    page.getByText("该助手当前不可公开访问。", { exact: true }),
  ).toBeVisible();
});
