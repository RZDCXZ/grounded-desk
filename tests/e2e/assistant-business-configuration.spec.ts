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

test("管理员保存并重新进入助手业务配置，校验失败时保留其他输入", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.getByRole("link", { name: "助手", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "助手配置", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("草稿", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("公开聊天链接")).toHaveCount(0);
  await expect(page.getByText("Iframe 嵌入代码")).toHaveCount(0);

  for (const hiddenSetting of [
    "系统提示词",
    "引用规则",
    "可靠性规则",
    "模型",
    "召回数量",
    "相关性阈值",
  ]) {
    await expect(page.getByText(hiddenSetting)).toHaveCount(0);
  }

  await page.getByLabel("助手名称").fill("演示业务顾问");
  await page
    .getByLabel("欢迎语")
    .fill("你好，我是演示业务顾问，可以帮你了解服务与支持方式。");
  await page
    .getByLabel("服务范围说明")
    .fill("回答演示业务的服务范围、交付流程和支持方式。");
  await page.getByText("友好", { exact: true }).click();
  await expect(page.getByLabel("友好")).toBeChecked();
  await page.getByLabel("人工联系入口文案").fill("联系业务团队");
  await page
    .getByLabel("人工联系 URL")
    .fill("https://example.com/contact");
  await page.getByRole("button", { name: "保存更改" }).click();

  await expect(page.getByRole("status")).toContainText("助手配置已保存");
  await page.reload();

  await expect(page.getByLabel("助手名称")).toHaveValue("演示业务顾问");
  await expect(page.getByLabel("欢迎语")).toHaveValue(
    "你好，我是演示业务顾问，可以帮你了解服务与支持方式。",
  );
  await expect(page.getByLabel("服务范围说明")).toHaveValue(
    "回答演示业务的服务范围、交付流程和支持方式。",
  );
  await expect(page.getByLabel("友好")).toBeChecked();
  await expect(page.getByLabel("人工联系入口文案")).toHaveValue(
    "联系业务团队",
  );
  await expect(page.getByLabel("人工联系 URL")).toHaveValue(
    "https://example.com/contact",
  );

  await page.getByLabel("助手名称").fill("");
  await page
    .getByLabel("欢迎语")
    .fill("这段输入应在名称校验失败后保留。");
  await page.getByRole("button", { name: "保存更改" }).click();

  await expect(page.getByText("请输入助手名称。")).toBeVisible();
  await expect(page.getByLabel("欢迎语")).toHaveValue(
    "这段输入应在名称校验失败后保留。",
  );

  await page.getByLabel("助手名称").fill("尚未保存的助手名称");
  await page.getByLabel("人工联系 URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "保存更改" }).click();

  await expect(
    page.getByText("请输入有效的 HTTP、HTTPS 或邮件联系地址。"),
  ).toBeVisible();
  await expect(page.getByLabel("助手名称")).toHaveValue(
    "尚未保存的助手名称",
  );
  await expect(page.getByLabel("欢迎语")).toHaveValue(
    "这段输入应在名称校验失败后保留。",
  );

  await page.reload();
  await expect(page.getByLabel("助手名称")).toHaveValue("演示业务顾问");
  await expect(page.getByLabel("欢迎语")).toHaveValue(
    "你好，我是演示业务顾问，可以帮你了解服务与支持方式。",
  );
});
