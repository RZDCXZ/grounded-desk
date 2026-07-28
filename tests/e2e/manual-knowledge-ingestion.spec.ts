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
  // Local Supabase Auth config enforces a one-second email send interval.
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

test("管理员导入手工知识来源并在概览看到可用数量", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page
    .getByRole("link", { name: "知识来源", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "知识来源", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();

  await page
    .getByLabel("标题", { exact: true })
    .fill("演示服务与响应说明");
  await page
    .getByLabel("正文", { exact: true })
    .fill(
      [
        "## 服务范围",
        "",
        "我们为演示网站提供知识整理、来源核查和有据回答配置服务，管理员可以持续维护业务内容。",
        "",
        "## 响应方式",
        "",
        "工作日的问题会在两个工作小时内确认，紧急情况请使用知识来源中列出的人工联系入口。",
      ].join("\n"),
    );
  await page
    .getByLabel("原始 URL（可选）", { exact: true })
    .fill("https://example.com/services");
  await page.getByRole("button", { name: "确认添加" }).click();

  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: "演示服务与响应说明" });
  await expect(sourceRow).toContainText("处理中");
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });
  await expect(sourceRow.getByRole("link")).toHaveAttribute(
    "href",
    "https://example.com/services",
  );

  await page.getByRole("link", { name: "概览" }).click();
  await expect(
    page.getByRole("article").filter({ hasText: "可用知识来源" }),
  ).toContainText("01");
});

test("无效手工正文显示安全失败原因且没有可用版本", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();

  await page
    .getByLabel("标题", { exact: true })
    .fill("过短的演示知识");
  await page
    .getByLabel("正文", { exact: true })
    .fill("这段正文太短，不能形成可靠的内容单元。");
  await page.getByRole("button", { name: "确认添加" }).click();

  const sourceRow = page.getByRole("row").filter({ hasText: "过短的演示知识" });
  await expect(sourceRow).toContainText("处理中");
  await expect(sourceRow).toContainText("失败", { timeout: 15_000 });
  await expect(sourceRow).toContainText(
    "正文内容过短，请补充至少 80 个字符后重试。",
  );
  await expect(sourceRow).toContainText("—");
});
