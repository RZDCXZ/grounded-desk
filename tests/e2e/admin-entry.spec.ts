import { expect, test, type APIRequestContext } from "@playwright/test";

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

test("未登录管理员通过受限 Magic Link 入口进入", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "进入 GroundedDesk" }),
  ).toBeVisible();
  await expect(page.getByLabel("管理员邮箱")).toHaveValue(
    "admin@groundeddesk.local",
  );
  await expect(
    page.getByRole("button", { name: "发送 Magic Link" }),
  ).toBeVisible();
  await expect(page.getByText("本地邮件查看器")).toBeVisible();
});

test("预配置管理员从本地邮件查看器完成真实 Magic Link 登录", async ({
  page,
  request,
}) => {
  const messagesBefore = await getMailpitMessages(request);
  const existingMessageIds = new Set(
    messagesBefore.messages.map(({ ID }) => ID),
  );

  await page.goto("/login");
  await page.getByRole("button", { name: "发送 Magic Link" }).click();
  await expect(page.getByRole("status")).toContainText("登录链接已发送");

  await expect
    .poll(async () => {
      const payload = await getMailpitMessages(request);
      return payload.total;
    })
    .toBeGreaterThan(messagesBefore.total);

  const messages = await getMailpitMessages(request);
  const message = messages.messages.find((candidate) =>
    !existingMessageIds.has(candidate.ID) &&
    candidate.To.some(({ Address }) => Address === "admin@groundeddesk.local"),
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
  await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "后台导航" })).toContainText(
    "概览知识来源助手会话待解决问题",
  );
  await expect(page.getByText("草稿").first()).toBeVisible();
  await expect(page.getByLabel("系统初始统计")).toContainText("00");
});
