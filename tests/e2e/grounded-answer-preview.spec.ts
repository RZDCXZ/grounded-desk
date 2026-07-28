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

test("管理员预览流式有据回答并在完成后核查服务端引用", async ({
  page,
  request,
}) => {
  const sourceTitle = `预览服务与响应说明 ${Date.now()}`;

  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();
  await page.getByLabel("标题", { exact: true }).fill(sourceTitle);
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
    .fill("https://example.com/preview-services");
  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: sourceTitle });
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });

  await page.getByRole("link", { name: "助手", exact: true }).click();
  await page
    .getByLabel("预览问题")
    .fill("你们提供什么服务，工作日多久响应？");
  await page.getByRole("button", { name: "发送问题" }).click();

  await expect(
    page.getByText("你们提供什么服务，工作日多久响应？", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/我们提供知识整理、来源核查和有据回答配置服务/),
  ).toBeVisible();
  await expect(page.getByText("回答依据", { exact: true })).toBeVisible();
  const citation = page.getByRole("link", {
    name: new RegExp(sourceTitle),
  });
  await expect(citation).toHaveAttribute(
    "href",
    "https://example.com/preview-services",
  );
  await expect(citation).toContainText(
    "https://example.com/preview-services",
  );
  await expect(
    page.getByText("有依据", { exact: true }),
  ).toBeVisible();
});
