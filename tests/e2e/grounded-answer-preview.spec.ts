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
  await expect(page.getByLabel("预览问题")).toHaveValue("");
  const factualRequest = page.getByRole("region", {
    name: "事实诉求 1",
  });
  await expect(factualRequest).toContainText("已回答");
  await expect(factualRequest).toContainText(
    "知识整理、来源核查和有据回答配置服务",
  );
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

test("管理员能区分可靠拒答并使用已配置的人工联系入口", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.route("**/api/admin/assistant/preview", async (route) => {
    await route.fulfill({
      body: `${JSON.stringify({
        type: "refusal",
        resultType: "grounded_refusal",
        message: "当前可用知识不足以支持这个问题的事实性回答。",
        contact: {
          label: "联系业务团队",
          url: "https://example.com/contact",
        },
      })}\n`,
      contentType: "application/x-ndjson; charset=utf-8",
      status: 200,
    });
  });

  await page.goto("/admin/assistant");
  await page.getByLabel("预览问题").fill("你们在上海有办公室吗？");
  await page.getByRole("button", { name: "发送问题" }).click();

  await expect(
    page.getByText("现有知识暂时无法确认", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("当前可用知识不足以支持这个问题的事实性回答。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "联系业务团队" }),
  ).toHaveAttribute("href", "https://example.com/contact");
  await expect(
    page.getByText("服务暂时不可用", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("回答依据", { exact: true })).toHaveCount(0);
});

test("管理员预览把交流性回应和澄清提问呈现为无附加动作的普通消息", async ({
  page,
  request,
}) => {
  const ordinaryResponses = [
    {
      answer: "您好，我是演示业务顾问。您可以咨询演示业务范围。",
      resultType: "conversational_response",
    },
    {
      answer: "您想了解“退款”的哪一方面？请补充具体问题。",
      resultType: "clarification_request",
    },
    {
      answer:
        "Hello, I’m Demo Business Advisor. You can ask about demo services.",
      resultType: "conversational_response",
    },
    {
      answer: "关于“退款 pricing”，您想了解哪一方面？请补充具体问题。",
      resultType: "clarification_request",
    },
  ] as const;
  let previewRequests = 0;
  await signInAsAdministrator(page, request);
  await page.route("**/api/admin/assistant/preview", async (route) => {
    previewRequests += 1;
    const response =
      ordinaryResponses[previewRequests - 1] ??
      ordinaryResponses.at(-1)!;
    await route.fulfill({
      body: [
        JSON.stringify({
          type: "text_delta",
          delta: response.answer,
        }),
        JSON.stringify({
          type: "complete",
          resultType: response.resultType,
          citations: [],
        }),
        "",
      ].join("\n"),
      contentType: "application/x-ndjson; charset=utf-8",
      status: 200,
    });
  });

  await page.goto("/admin/assistant");
  const preview = page.getByLabel("助手后台预览");
  await page.getByLabel("预览问题").fill("你好");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    preview.getByText(
      "您好，我是演示业务顾问。您可以咨询演示业务范围。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    preview.getByText("回答依据", { exact: true }),
  ).toHaveCount(0);
  await expect(
    preview.getByText("现有知识暂时无法确认", { exact: true }),
  ).toHaveCount(0);
  await expect(
    preview.getByRole("link", { name: "联系业务团队" }),
  ).toHaveCount(0);

  await page.getByLabel("预览问题").fill("退款");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    preview.getByText(
      "您想了解“退款”的哪一方面？请补充具体问题。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    preview.getByText("回答依据", { exact: true }),
  ).toHaveCount(0);
  await expect(
    preview.getByText("现有知识暂时无法确认", { exact: true }),
  ).toHaveCount(0);
  await expect(
    preview.getByText(/conversational_response|clarification_request/),
  ).toHaveCount(0);

  await page.getByLabel("预览问题").fill("Hello");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    preview.getByText(
      "Hello, I’m Demo Business Advisor. You can ask about demo services.",
      { exact: true },
    ),
  ).toBeVisible();

  await page.getByLabel("预览问题").fill("退款 pricing");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    preview.getByText(
      "关于“退款 pricing”，您想了解哪一方面？请补充具体问题。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    preview.getByText("回答依据", { exact: true }),
  ).toHaveCount(0);
  await expect(
    preview.getByRole("link", { name: "联系业务团队" }),
  ).toHaveCount(0);
});

test("技术故障清空输入并允许成功重试且不重复显示回答", async ({
  page,
  request,
}) => {
  let previewRequests = 0;

  await signInAsAdministrator(page, request);
  await page.route("**/api/admin/assistant/preview", async (route) => {
    previewRequests += 1;
    const events =
      previewRequests === 1
        ? [
            {
              type: "temporary_failure",
              reason: "rate_limited",
              message: "供应商服务暂时不可用，请稍后重试。",
              retryable: true,
              contact: {
                label: "联系业务团队",
                url: "https://example.com/contact",
              },
            },
          ]
        : [
            {
              type: "text_delta",
              delta: "重试后得到唯一一条有据回答。",
            },
            {
              type: "complete",
              resultType: "grounded_answer",
              citations: [],
            },
          ];

    await route.fulfill({
      body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      contentType: "application/x-ndjson; charset=utf-8",
      status: 200,
    });
  });

  await page.goto("/admin/assistant");
  await page.getByLabel("预览问题").fill("你们提供什么服务？");
  await page.getByRole("button", { name: "发送问题" }).click();

  await expect(
    page.getByText("服务暂时不可用", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("供应商服务暂时不可用，请稍后重试。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("供应商限流", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "联系业务团队" }),
  ).toHaveAttribute("href", "https://example.com/contact");
  await expect(page.getByLabel("预览问题")).toHaveValue("");

  await page.getByRole("button", { name: "重试预览" }).click();

  await expect(
    page.getByText("重试后得到唯一一条有据回答。", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("服务暂时不可用", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("你们提供什么服务？", { exact: true }),
  ).toHaveCount(1);
  expect(previewRequests).toBe(2);
});

test("回答正文只渲染受控 Markdown 并移除危险内容", async ({
  page,
  request,
}) => {
  const answer = [
    "## 服务说明",
    "",
    "**安全正文**与[官方网站](https://example.com/safe)。",
    "",
    "<div>原始 HTML 不应显示</div>",
    "<script>window.__markdownXss = true</script>",
    "<iframe src=\"https://example.com/embed\">嵌入内容</iframe>",
    "![跟踪图片](https://example.com/tracker.png)",
    "[危险脚本链接](javascript:alert(1))",
    "[危险数据链接](data:text/html;base64,SGVsbG8=)",
  ].join("\n");

  await signInAsAdministrator(page, request);
  await page.route("**/api/admin/assistant/preview", async (route) => {
    await route.fulfill({
      body: [
        JSON.stringify({ type: "text_delta", delta: answer }),
        JSON.stringify({
          type: "complete",
          resultType: "grounded_answer",
          citations: [],
        }),
        "",
      ].join("\n"),
      contentType: "application/x-ndjson; charset=utf-8",
      status: 200,
    });
  });

  await page.goto("/admin/assistant");
  await page.getByLabel("预览问题").fill("请说明服务内容。");
  await page.getByRole("button", { name: "发送问题" }).click();

  await expect(
    page.getByRole("heading", { name: "服务说明" }),
  ).toBeVisible();
  await expect(page.getByText("安全正文", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "官方网站" })).toHaveCount(0);
  await expect(
    page
      .getByLabel("助手后台预览")
      .locator('[href="https://example.com/safe"]'),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("助手后台预览")
      .locator("script, iframe, img"),
  ).toHaveCount(0);
  await expect(page.getByText("原始 HTML 不应显示")).toHaveCount(0);
  await expect(page.getByText("嵌入内容")).toHaveCount(0);
  await expect(page.getByText("跟踪图片")).toHaveCount(0);
  await expect(page.getByText("危险脚本链接")).toHaveCount(0);
  await expect(page.getByText("危险数据链接")).toHaveCount(0);
  expect(
    await page.evaluate(() => "__markdownXss" in window),
  ).toBe(false);
});
