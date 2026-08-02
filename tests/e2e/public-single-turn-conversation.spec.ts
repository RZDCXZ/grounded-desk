import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const organizationId = "00000000-0000-4000-8000-000000000101";

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

test("管理员通过网页知识完成预览、发布、公开咨询、引用核查和下线闭环", async ({
  context,
  page,
  request,
}) => {
  const scenarioId = Date.now();
  const conversationalQuestion = "你好";
  const clarificationQuestion = "退款";
  const sourceMarker = `PUBLIC-SERVICE-MAIN-CLOSURE-${scenarioId}`;
  const sourceTitle = `受控网页服务说明 ${sourceMarker}`;
  const sourceUrl =
    `http://127.0.0.1:4173/article?marker=${encodeURIComponent(sourceMarker)}`;

  await signInAsAdministrator(page, request);
  await page.goto("/admin/assistant");

  await expect(page.getByText("草稿", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("公开会话链接")).toHaveCount(0);
  await expect(page.getByLabel("Iframe 嵌入代码")).toHaveCount(0);

  await page.getByLabel("助手名称").fill("演示业务顾问");
  await page
    .getByLabel("欢迎语")
    .fill("你好，我可以帮助你核查演示业务的服务与支持方式。");
  await page.getByLabel("服务范围说明").fill("演示业务范围");
  await page.getByText("专业", { exact: true }).click();
  await expect(page.getByLabel("专业")).toBeChecked();
  await page.getByLabel("人工联系入口文案").fill("联系业务团队");
  await page
    .getByLabel("人工联系 URL")
    .fill("https://example.com/contact");
  await page.getByRole("button", { name: "保存更改" }).click();
  await expect(page.getByRole("status")).toContainText("助手配置已保存");

  await page.getByRole("link", { name: "知识来源", exact: true }).click();
  await disableAllKnowledgeSources(page);
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page
    .getByLabel("公开 HTTP/HTTPS 地址")
    .fill(sourceUrl);
  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: sourceUrl });
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(sourceRow).toContainText(sourceTitle, { timeout: 15_000 });
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });

  await page.getByRole("link", { name: "助手", exact: true }).click();
  await page
    .getByLabel("预览问题")
    .fill(
      "PUBLIC-SERVICE-MAIN-CLOSURE 你们提供什么服务，工作日多久响应？",
    );
  await page.getByRole("button", { name: "发送问题" }).click();
  const previewFactualRequest = page.getByRole("region", {
    name: "你们提供什么服务",
  });
  await expect(previewFactualRequest).toContainText("已回答");
  await expect(previewFactualRequest).toContainText(
    "工作日问题会在两个工作小时内确认",
  );
  await expect(
    previewFactualRequest.getByRole("link", {
      name: new RegExp(sourceTitle),
    }),
  ).toHaveAttribute("href", sourceUrl);

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
  const embedCodeField = page.getByLabel("Iframe 嵌入代码");
  await expect(embedCodeField).toBeVisible();
  const embedCode = await embedCodeField.inputValue();
  const embedScriptUrl = embedCode.match(/src="([^"]+embed\.js)"/)?.[1];
  expect(embedScriptUrl).toBeDefined();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3000",
  });
  await page.getByRole("button", { name: "复制嵌入代码" }).click();
  await expect(page.getByRole("status")).toContainText("嵌入代码已复制");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(embedCode);

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

  const publicMessagesPattern =
    `**/api/public/assistants/${publicPath.split("/").at(-1)}/messages`;
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
  let ordinaryMessageRequests = 0;
  await page.route(publicMessagesPattern, async (route) => {
    ordinaryMessageRequests += 1;
    const response =
      ordinaryResponses[ordinaryMessageRequests - 1] ??
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
      headers: {
        "x-assistant-message-id":
          `00000000-0000-4000-8000-00000000050${ordinaryMessageRequests}`,
        "x-conversation-id":
          "00000000-0000-4000-8000-000000000401",
      },
      status: 200,
    });
  });
  const publicQuestion = page.getByLabel("咨询问题");
  await publicQuestion.fill("你好");
  await publicQuestion.press("Shift+Enter");
  await expect(publicQuestion).toHaveValue("你好\n");
  expect(ordinaryMessageRequests).toBe(0);
  await publicQuestion.fill("你好");
  await publicQuestion.press("Enter");
  await expect(publicQuestion).toHaveValue("");
  await expect(
    page.getByText(
      "您好，我是演示业务顾问。您可以咨询演示业务范围。",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("咨询问题").fill("退款");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText(
      "您想了解“退款”的哪一方面？请补充具体问题。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("回答依据", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "评价这条助手回答" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "联系业务团队" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("现有知识暂时无法确认", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/conversational_response|clarification_request/),
  ).toHaveCount(0);
  await page.getByLabel("咨询问题").fill("Hello");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText(
      "Hello, I’m Demo Business Advisor. You can ask about demo services.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("咨询问题").fill("退款 pricing");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText(
      "关于“退款 pricing”，您想了解哪一方面？请补充具体问题。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("回答依据", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "联系业务团队" }),
  ).toHaveCount(0);
  await page.setViewportSize({ height: 800, width: 360 });
  await expect(
    page.getByText(
      "您想了解“退款”的哪一方面？请补充具体问题。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("咨询问题")).toBeVisible();
  await expect(page.getByRole("button", { name: "发送问题" })).toBeVisible();
  await page.setViewportSize({ height: 720, width: 1_280 });
  await page.unroute(publicMessagesPattern);
  await page.reload();

  const administratorDataClient =
    await createAdministratorDataClient();
  const aiCallsBeforeConversational =
    await readOrganizationAiCallTypes(administratorDataClient);
  await page.getByLabel("咨询问题").fill(conversationalQuestion);
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText(/您好，我是演示业务顾问/),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await readOrganizationAiCallTypes(administratorDataClient)).length,
    )
    .toBe(aiCallsBeforeConversational.length + 1);
  const aiCallsAfterConversational =
    await readOrganizationAiCallTypes(administratorDataClient);
  expect(aiCallsAfterConversational.at(-1)).toBe("request_analysis");

  const knowledgeControlPage = await context.newPage();
  await knowledgeControlPage.goto("/admin/knowledge-sources");
  const persistedSourceRow = knowledgeControlPage
    .getByRole("row")
    .filter({ hasText: sourceTitle });
  await disableAllKnowledgeSources(knowledgeControlPage);
  await expect(persistedSourceRow).toContainText("已停用");
  await page.reload();

  await page.getByLabel("咨询问题").fill(clarificationQuestion);
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText(
      "请补充：想了解退款的具体方面。",
      { exact: true },
    ),
  ).toBeVisible();
  const aiCallsAfterClarification =
    await readOrganizationAiCallTypes(administratorDataClient);
  const clarificationAiCalls = aiCallsAfterClarification.slice(
    aiCallsAfterConversational.length,
  );
  expect(clarificationAiCalls).toEqual(["request_analysis"]);
  await persistedSourceRow
    .getByRole("button", { name: "重新启用" })
    .click();
  await expect(persistedSourceRow).toContainText("可用");
  await knowledgeControlPage.close();
  await page.reload();

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
  const publicMessageResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/public/assistants/"),
  );
  await page.getByRole("button", { name: "发送问题" }).click();
  const publicMessageResponse = await publicMessageResponsePromise;

  expect(publicMessageResponse.headers()["content-type"]).toContain(
    "application/x-ndjson",
  );
  await expect(
    page.getByText(/我们提供知识整理、来源核查和有据回答配置服务/),
  ).toBeVisible();
  await expect(page.getByText("回答依据", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(sourceTitle) }),
  ).toHaveAttribute("href", sourceUrl);
  const citationPagePromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: new RegExp(sourceTitle) }).click();
  const citationPage = await citationPagePromise;
  await expect(citationPage).toHaveURL(sourceUrl);
  await expect(
    citationPage.getByRole("heading", { name: sourceTitle }),
  ).toBeVisible();
  await citationPage.close();
  await expect(
    page.getByRole("group", { name: "评价这条助手回答" }),
  ).toBeVisible();
  const aiCallsBeforeGroundedAnswer = aiCallsAfterClarification.length;
  await expect
    .poll(async () =>
      (await readOrganizationAiCallTypes(administratorDataClient)).slice(
        aiCallsBeforeGroundedAnswer,
      ),
    )
    .toEqual([
      "request_analysis",
      "embedding",
      "rerank",
      "evidence_coverage",
      "answer",
    ]);
  await page.getByRole("button", { name: "没帮助" }).click();
  await expect(page.getByRole("status")).toContainText(
    "已记录，感谢反馈",
  );

  const adminReviewPage = await context.newPage();
  await adminReviewPage.goto("/admin/conversations");
  const conversationList = adminReviewPage.getByRole("complementary", {
    name: "会话列表",
  });
  const conversationResultFilters = adminReviewPage.getByRole(
    "navigation",
    { name: "会话结果筛选" },
  );
  await expect(
    conversationResultFilters.getByRole("link", {
      name: "交流性回应 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    conversationResultFilters.getByRole("link", {
      name: "澄清提问 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    conversationResultFilters.getByRole("link", {
      name: "有据回答 1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    conversationResultFilters.getByRole("link", {
      name: "可靠拒答 0",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    conversationResultFilters.getByRole("link", {
      name: "技术故障 0",
      exact: true,
    }),
  ).toBeVisible();

  await conversationResultFilters
    .getByRole("link", { name: "交流性回应 1", exact: true })
    .click();
  await expect(
    conversationList.getByText(conversationalQuestion, { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText(clarificationQuestion, { exact: true }),
  ).toHaveCount(0);
  await conversationList
    .getByRole("link", { name: /你好/ })
    .click();
  const conversationalMessage = adminReviewPage
    .getByRole("article")
    .filter({ hasText: /您好，我是演示业务顾问/ });
  await expect(
    conversationalMessage.getByText("交流性回应", { exact: true }),
  ).toBeVisible();
  await expect(
    conversationalMessage.getByText("有据回答", { exact: true }),
  ).toHaveCount(0);
  await expect(
    conversationalMessage.getByText("回答依据", { exact: true }),
  ).toHaveCount(0);
  await expect(
    conversationalMessage.getByText(/访客评价|待解决问题/),
  ).toHaveCount(0);

  await conversationResultFilters
    .getByRole("link", { name: "澄清提问 1", exact: true })
    .click();
  await expect(
    conversationList.getByText(clarificationQuestion, { exact: true }),
  ).toBeVisible();
  await expect(
    conversationList.getByText(conversationalQuestion, { exact: true }),
  ).toHaveCount(0);
  const clarificationConversationLink = conversationList.getByRole(
    "link",
    { name: /退款/ },
  );
  await expect(
    clarificationConversationLink.getByText("尚无质量反馈", {
      exact: true,
    }),
  ).toHaveCount(0);
  await clarificationConversationLink.click();
  const clarificationMessage = adminReviewPage
    .getByRole("article")
    .filter({ hasText: "请补充：想了解退款的具体方面。" });
  await expect(
    clarificationMessage.getByText("澄清提问", { exact: true }),
  ).toBeVisible();
  await expect(
    clarificationMessage.getByText("可靠拒答", { exact: true }),
  ).toHaveCount(0);
  await expect(
    clarificationMessage.getByText("回答依据", { exact: true }),
  ).toHaveCount(0);
  await expect(
    clarificationMessage.getByText(/访客评价|待解决问题/),
  ).toHaveCount(0);

  await adminReviewPage.goto("/admin");
  const overviewMetrics = adminReviewPage.getByRole("region", {
    name: "系统初始统计",
  });
  await expect(
    overviewMetrics.getByText("交流性回应", { exact: true }),
  ).toHaveCount(0);
  await expect(
    overviewMetrics.getByText("澄清提问", { exact: true }),
  ).toHaveCount(0);

  await adminReviewPage.goto("/admin/unresolved-questions");
  await expect(
    adminReviewPage.getByRole("heading", { name: "待解决问题" }),
  ).toBeVisible();
  await expect(
    adminReviewPage.getByText(conversationalQuestion, { exact: true }),
  ).toHaveCount(0);
  await expect(
    adminReviewPage.getByText(clarificationQuestion, { exact: true }),
  ).toHaveCount(0);
  await expect(
    adminReviewPage.getByText("没帮助", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    adminReviewPage.getByText(
      `${sourceMarker} 你们提供什么服务？`,
      { exact: true },
    ).last(),
  ).toBeVisible();
  await adminReviewPage
    .getByRole("link", { name: "查看会话上下文" })
    .click();
  await expect(
    adminReviewPage.getByText("正在复盘关联待解决问题"),
  ).toBeVisible();
  await expect(
    adminReviewPage.getByText("访客评价：没帮助"),
  ).toBeVisible();
  await adminReviewPage
    .getByRole("link", { name: "返回待解决问题" })
    .click();
  await adminReviewPage
    .getByRole("button", { name: "标记为已解决" })
    .click();
  await adminReviewPage
    .getByRole("link", { name: /^已解决 \(1\)$/ })
    .click();
  await expect(
    adminReviewPage.getByText(
      `${sourceMarker} 你们提供什么服务？`,
      { exact: true },
    ).last(),
  ).toBeVisible();
  await expect(
    adminReviewPage.getByText("已解决", { exact: true }).first(),
  ).toBeVisible();

  await adminReviewPage.goto(
    "/admin/conversations?status=conversational_response",
  );
  await conversationList
    .getByRole("link", { name: /你好/ })
    .click();
  await adminReviewPage
    .getByRole("button", { name: "删除会话" })
    .click();
  await adminReviewPage
    .getByRole("button", { name: "确认永久删除" })
    .click();
  await expect(
    conversationResultFilters.getByRole("link", {
      name: "交流性回应 0",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    conversationResultFilters.getByRole("link", {
      name: "澄清提问 1",
      exact: true,
    }),
  ).toBeVisible();
  await adminReviewPage.close();

  const hostPage = await context.newPage();
  await hostPage.goto("/");
  await hostPage.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <style>
          body { margin: 0; background: rgb(245, 240, 230); color: rgb(120, 20, 20); }
          .host-contact { position: fixed; right: 24px; bottom: 24px; }
        </style>
      </head>
      <body>
        <main>
          <h1>受控宿主页面</h1>
          <p>宿主页面主体内容保持可见。</p>
          <a class="host-contact" href="mailto:host@example.com">宿主直接联系方式</a>
        </main>
      </body>
    </html>
  `);
  await hostPage.evaluate(async (scriptUrl) => {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src = scriptUrl;
      script.addEventListener("load", () => resolve());
      script.addEventListener("error", () =>
        reject(new Error("嵌入脚本加载失败")),
      );
      document.head.append(script);
    });
  }, embedScriptUrl!);

  await expect(
    hostPage.getByRole("button", { name: "打开演示业务顾问" }),
  ).toBeVisible();
  await expect(
    hostPage.getByRole("heading", { name: "受控宿主页面" }),
  ).toBeVisible();
  await expect(
    hostPage.getByRole("link", { name: "宿主直接联系方式" }),
  ).toBeVisible();
  const launcherBox = await hostPage
    .getByRole("button", { name: "打开演示业务顾问" })
    .boundingBox();
  const hostContactBox = await hostPage
    .getByRole("link", { name: "宿主直接联系方式" })
    .boundingBox();
  expect(launcherBox).not.toBeNull();
  expect(hostContactBox).not.toBeNull();
  expect(
    rectanglesOverlap(launcherBox!, hostContactBox!),
    "悬浮入口不应遮挡宿主右下角已有的直接联系方式",
  ).toBe(false);
  await expect
    .poll(() =>
      hostPage.evaluate(() => getComputedStyle(document.body).color),
    )
    .toBe("rgb(120, 20, 20)");

  await hostPage
    .getByRole("button", { name: "打开演示业务顾问" })
    .click();
  const embeddedConversation = hostPage.frameLocator(
    'iframe[title="演示业务顾问会话"]',
  );
  await expect(
    embeddedConversation.getByRole("heading", { name: "演示业务顾问" }),
  ).toBeVisible();
  const hostCanReadIframeDocument = await hostPage
    .locator('iframe[title="演示业务顾问会话"]')
    .evaluate((frame) => {
      try {
        return Boolean((frame as HTMLIFrameElement).contentDocument);
      } catch {
        return false;
      }
    });
  expect(hostCanReadIframeDocument).toBe(false);
  await embeddedConversation
    .getByLabel("咨询问题")
    .fill(`${sourceMarker} 嵌入入口提供什么服务？`);
  await embeddedConversation
    .getByRole("button", { name: "发送问题" })
    .click();
  await expect(
    embeddedConversation.getByText(
      /我们提供知识整理、来源核查和有据回答配置服务/,
    ),
  ).toBeVisible();
  await expect(
    embeddedConversation.getByRole("link", {
      name: new RegExp(sourceTitle),
    }),
  ).toHaveAttribute("href", sourceUrl);
  const embeddedScrollMetrics = await embeddedConversation
    .getByTestId("conversation-scroll-region")
    .evaluate((region) => {
      const documentElement = document.documentElement;
      const composer = document.querySelector(
        '[data-testid="conversation-composer"]',
      );
      const assistantHeader = document.querySelector(
        '[data-testid="assistant-header"]',
      );

      return {
        documentScrolls:
          documentElement.scrollHeight > documentElement.clientHeight + 1,
        messageRegionScrolls:
          region.scrollHeight > region.clientHeight + 1,
        composerBottom: composer?.getBoundingClientRect().bottom,
        headerTop: assistantHeader?.getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
      };
    });
  expect(embeddedScrollMetrics.documentScrolls).toBe(false);
  expect(embeddedScrollMetrics.messageRegionScrolls).toBe(true);
  expect(embeddedScrollMetrics.headerTop).toBe(0);
  expect(embeddedScrollMetrics.composerBottom).toBe(
    embeddedScrollMetrics.viewportHeight,
  );
  await expect(
    hostPage.getByRole("heading", { name: "受控宿主页面" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      hostPage.evaluate(() => getComputedStyle(document.body).color),
    )
    .toBe("rgb(120, 20, 20)");
  await hostPage.close();
  await page.getByLabel("咨询问题").fill("它包含实施支持吗？");
  await page.getByRole("button", { name: "发送问题" }).click();
  await expect(
    page.getByText("它包含实施支持吗？", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/我们提供知识整理、来源核查和有据回答配置服务/),
  ).toHaveCount(2);
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
                  resultType: "grounded_answer",
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
                  resultType: "grounded_answer",
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
  const embedScriptResponse = await request.get(embedScriptUrl!);
  expect(embedScriptResponse.status()).toBe(404);

  await page.goto(publicPath);
  await expect(
    page.getByText("该助手当前不可公开访问。", { exact: true }),
  ).toBeVisible();
});

test("管理员补充知识后已发布助手立即改进回答并解决问题", async ({
  context,
  page,
  request,
}) => {
  const scenarioId = Date.now();
  const sourceTitle = `退款规则说明 ${scenarioId}`;
  const sourceMarker = `REFUND-POLICY-${scenarioId}-`.repeat(8);
  const question = `${sourceMarker} 演示服务可以在几天内申请退款？`;

  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await disableAllKnowledgeSources(page);

  await page.goto("/admin/assistant");
  const publishButton = page.getByRole("button", {
    name: /^(发布助手|重新发布助手)$/,
  });
  if ((await publishButton.count()) > 0) {
    await publishButton.click();
  }

  await expect(page.getByText("已发布", { exact: true }).first()).toBeVisible();
  const publicUrl = await page
    .getByRole("link", { name: "打开公开页面" })
    .getAttribute("href");
  expect(publicUrl).toBeTruthy();

  const visitorPage = await context.newPage();
  await visitorPage.goto(new URL(publicUrl!).pathname);
  await visitorPage.getByLabel("咨询问题").fill(question);
  await visitorPage.getByRole("button", { name: "发送问题" }).click();

  await expect(
    visitorPage.getByText("现有知识暂时无法确认", { exact: true }),
  ).toBeVisible();
  await expect(
    visitorPage.getByText(
      "当前可用知识不足以支持这个问题的事实性回答。",
      { exact: true },
    ),
  ).toBeVisible();

  await page.goto("/admin/unresolved-questions");
  await expect(page.getByText(question, { exact: true }).last()).toBeVisible();
  await expect(
    page.getByText("知识无支持", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      "当前可用知识不足以支持这个问题的事实性回答。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText("这条回答没有引用。")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "查看会话上下文" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "更新知识来源" }).click();
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();
  await page.getByLabel("标题", { exact: true }).fill(sourceTitle);
  await page
    .getByLabel("正文", { exact: true })
    .fill(
      [
        "## 退款规则",
        "",
        `演示服务支持在购买后的七天内申请退款。管理员确认申请符合规则后，会按原支付方式处理。${sourceMarker} ${sourceMarker}`,
      ].join("\n"),
    );
  await page
    .getByLabel("原始 URL（可选）", { exact: true })
    .fill("https://example.com/refund-policy");

  const sourceRow = page.getByRole("row").filter({ hasText: sourceTitle });
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });

  await visitorPage.getByLabel("咨询问题").fill(question);
  await visitorPage.getByRole("button", { name: "发送问题" }).click();

  await expect(visitorPage.getByText(/七天内申请退款/)).toBeVisible();
  await expect(
    visitorPage.getByRole("link", { name: new RegExp(sourceTitle) }),
  ).toHaveAttribute("href", "https://example.com/refund-policy");

  await page.goto("/admin/unresolved-questions");
  await page.getByRole("button", { name: "标记为已解决" }).click();
  await page.getByRole("link", { name: /^已解决 \(\d+\)$/ }).click();

  await expect(page.getByText(question, { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/已于 .* 解决/)).toBeVisible();
});

function rectanglesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

async function disableAllKnowledgeSources(page: Page) {
  const disableSourceButtons = page.getByRole("button", {
    name: "停用",
    exact: true,
  });
  while ((await disableSourceButtons.count()) > 0) {
    const activeSourceRow = disableSourceButtons
      .first()
      .locator("xpath=ancestor::tr");
    const sourceTitle = await activeSourceRow
      .locator("td")
      .first()
      .locator("p")
      .first()
      .innerText();
    const sourceRow = page
      .getByRole("row")
      .filter({ has: page.getByText(sourceTitle, { exact: true }) });
    await activeSourceRow
      .getByRole("button", { name: "停用", exact: true })
      .click();
    await expect(
      sourceRow.getByRole("button", { name: "重新启用", exact: true }),
    ).toBeVisible();
  }
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
  return administratorClient;
}

async function readOrganizationAiCallTypes(
  administratorClient: Awaited<
    ReturnType<typeof createAdministratorDataClient>
  >,
) {
  const { data, error } = await administratorClient
    .from("ai_call_logs")
    .select("call_type, created_at, id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  expect(error).toBeNull();
  return (data ?? []).map(({ call_type }) => call_type as string);
}
