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

test("管理员导入受控公开网页并看到提取标题和可用状态", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();

  await expect(page.getByRole("tab", { name: "网页 URL" })).toHaveAttribute(
    "data-state",
    "active",
  );
  await page
    .getByLabel("公开 HTTP/HTTPS 地址")
    .fill("http://127.0.0.1:4173/article");

  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: "http://127.0.0.1:4173/article" });
  const processingObserved = sourceRow
    .getByText("处理中", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "确认添加" }).click();

  await processingObserved;
  await expect(sourceRow).toContainText("受控网页服务说明", {
    timeout: 15_000,
  });
  await expect(sourceRow).toContainText("可用");
  await expect(sourceRow.getByRole("link")).toHaveAttribute(
    "href",
    "http://127.0.0.1:4173/article",
  );

  const refreshProcessingObserved = sourceRow
    .getByText("处理中", { exact: true })
    .waitFor();
  await sourceRow.getByRole("button", { name: "重新处理" }).click();
  await refreshProcessingObserved;
  await expect(sourceRow).toContainText("新知识版本 v2");
  await expect(sourceRow).toContainText("当前 v1 继续可用");
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });
  await expect(sourceRow).toContainText("v2");
});

test("管理员导入手工知识来源并在概览看到可用数量", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  const availableSourceMetric = page
    .getByRole("article")
    .filter({ hasText: "可用知识来源" });
  const availableSourcesBefore = Number(
    await availableSourceMetric.locator(".mono").textContent(),
  );
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
  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: "演示服务与响应说明" });
  const processingObserved = sourceRow
    .getByText("处理中", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "确认添加" }).click();

  await processingObserved;
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });
  await expect(sourceRow.getByRole("link")).toHaveAttribute(
    "href",
    "https://example.com/services",
  );

  await page.getByRole("link", { name: "概览" }).click();
  await expect(
    page.getByRole("article").filter({ hasText: "可用知识来源" }),
  ).toContainText(String(availableSourcesBefore + 1).padStart(2, "0"));
});

test("管理员更新手工知识来源时旧版本持续可用且失败更新无需恢复", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();
  await page
    .getByLabel("标题", { exact: true })
    .fill("等待原子更新的服务说明");
  await page
    .getByLabel("正文", { exact: true })
    .fill(repeatLifecycleBody("首次形成可用版本"));

  const originalRow = page
    .getByRole("row")
    .filter({ hasText: "等待原子更新的服务说明" });
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(originalRow).toContainText("可用", { timeout: 15_000 });
  await expect(originalRow).toContainText("v1");

  await originalRow.getByRole("button", { name: "更新" }).click();
  const updateSheet = page.getByRole("dialog", {
    name: "更新手工知识来源",
  });
  await expect(updateSheet).toHaveAccessibleDescription(
    "新知识版本完整处理成功后才会替换当前版本；处理期间当前版本继续参与回答。",
  );
  await updateSheet
    .getByLabel("更新标题", { exact: true })
    .fill("已经原子更新的服务说明");
  await updateSheet
    .getByLabel("更新正文", { exact: true })
    .fill(repeatLifecycleBody("原子替换当前版本"));

  const updateProcessingObserved = originalRow
    .getByText("处理中", { exact: true })
    .waitFor();
  await updateSheet
    .getByRole("button", { name: "创建新知识版本" })
    .click();
  await updateProcessingObserved;
  await expect(originalRow).toContainText("新知识版本 v2");
  await expect(originalRow).toContainText("当前 v1 继续可用");

  const updatedRow = page
    .getByRole("row")
    .filter({ hasText: "已经原子更新的服务说明" });
  await expect(updatedRow).toContainText("可用", { timeout: 15_000 });
  await expect(updatedRow).toContainText("v2");

  await updatedRow.getByRole("button", { name: "更新" }).click();
  await page
    .getByRole("dialog", { name: "更新手工知识来源" })
    .getByLabel("更新正文", { exact: true })
    .fill("这次更新过短，应该失败。");
  await page
    .getByRole("dialog", { name: "更新手工知识来源" })
    .getByRole("button", { name: "创建新知识版本" })
    .click();

  await expect(updatedRow).toContainText(
    "正文内容过短，请补充至少 80 个字符后重试。",
    { timeout: 15_000 },
  );
  await expect(updatedRow).toContainText("可用");
  await expect(updatedRow).toContainText("v2");
});

test("失败的手工更新保留草稿且重新提交不会跳过版本号", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();
  await page
    .getByLabel("标题", { exact: true })
    .fill("保留失败草稿的服务说明");
  await page
    .getByLabel("正文", { exact: true })
    .fill(repeatLifecycleBody("创建初始版本"));

  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: "保留失败草稿的服务说明" });
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });
  await expect(sourceRow).toContainText("v1");

  await sourceRow.getByRole("button", { name: "更新" }).click();
  await page
    .getByRole("dialog", { name: "更新手工知识来源" })
    .getByLabel("更新正文", { exact: true })
    .fill("两字");
  await page
    .getByRole("dialog", { name: "更新手工知识来源" })
    .getByRole("button", { name: "创建新知识版本" })
    .click();

  await expect(sourceRow).toContainText(
    "正文内容过短，请补充至少 80 个字符后重试。",
    { timeout: 15_000 },
  );
  await expect(
    sourceRow.getByText("失败", { exact: true }),
  ).toBeVisible();
  await expect(sourceRow).toContainText("v1");

  await sourceRow.getByRole("button", { name: "更新" }).click();
  const retrySheet = page.getByRole("dialog", {
    name: "更新手工知识来源",
  });
  await expect(
    retrySheet.getByLabel("更新正文", { exact: true }),
  ).toHaveValue("两字");
  await retrySheet
    .getByLabel("更新正文", { exact: true })
    .fill(repeatLifecycleBody("修正失败草稿"));

  const retryProcessingObserved = sourceRow
    .getByText("处理中", { exact: true })
    .waitFor();
  await retrySheet
    .getByRole("button", { name: "创建新知识版本" })
    .click();
  await retryProcessingObserved;
  await expect(sourceRow).toContainText("新知识版本 v2");
  await expect(sourceRow).toContainText("当前 v1 继续可用");
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });
  await expect(sourceRow).toContainText("v2");
});

test("无效手工正文显示安全失败原因且没有可用版本", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();

  await page
    .getByLabel("标题", { exact: true })
    .fill("过短的演示知识");
  await page
    .getByLabel("正文", { exact: true })
    .fill("这段正文太短，不能形成可靠的内容单元。");
  const sourceRow = page.getByRole("row").filter({ hasText: "过短的演示知识" });
  const processingObserved = sourceRow
    .getByText("处理中", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "确认添加" }).click();

  await processingObserved;
  await expect(sourceRow).toContainText("失败", { timeout: 15_000 });
  await expect(sourceRow).toContainText(
    "正文内容过短，请补充至少 80 个字符后重试。",
  );
  await expect(sourceRow).toContainText("—");

  const retryProcessingObserved = sourceRow
    .getByText("处理中", { exact: true })
    .waitFor();
  await sourceRow.getByRole("button", { name: "重试" }).click();
  await retryProcessingObserved;
  await expect(sourceRow).toContainText("失败", { timeout: 15_000 });
  await expect(sourceRow).toContainText(
    "正文内容过短，请补充至少 80 个字符后重试。",
  );

  await sourceRow.getByRole("button", { name: "停用" }).click();
  await expect(sourceRow).toContainText("已停用");
  await sourceRow.getByRole("button", { name: "重新启用" }).click();
  await expect(sourceRow).toContainText("失败");
});

test("管理员停用和重新启用知识来源且概览数量保持一致", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  const availableSourceMetric = page
    .getByRole("article")
    .filter({ hasText: "可用知识来源" });
  const availableSourcesBefore = Number(
    await availableSourceMetric.locator(".mono").textContent(),
  );

  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();
  await page
    .getByLabel("标题", { exact: true })
    .fill("可停用的演示知识来源");
  await page
    .getByLabel("正文", { exact: true })
    .fill(repeatLifecycleBody("停用与重新启用"));

  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: "可停用的演示知识来源" });
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });

  await sourceRow.getByRole("button", { name: "停用" }).click();
  await expect(sourceRow).toContainText("已停用");
  await expect(sourceRow).toContainText("v1");

  await page.getByRole("link", { name: "概览" }).click();
  await expect(availableSourceMetric).toContainText(
    String(availableSourcesBefore).padStart(2, "0"),
  );

  await page.getByRole("link", { name: "知识来源", exact: true }).click();
  await sourceRow.getByRole("button", { name: "重新启用" }).click();
  await expect(sourceRow).toContainText("可用");
  await expect(sourceRow).toContainText("v1");

  await page.getByRole("link", { name: "概览" }).click();
  await expect(availableSourceMetric).toContainText(
    String(availableSourcesBefore + 1).padStart(2, "0"),
  );
});

test("管理员明确确认后永久删除知识来源且取消不会产生变更", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();
  await page
    .getByLabel("标题", { exact: true })
    .fill("等待删除的演示知识来源");
  await page
    .getByLabel("正文", { exact: true })
    .fill(repeatLifecycleBody("永久删除"));

  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: "等待删除的演示知识来源" });
  await page.getByRole("button", { name: "确认添加" }).click();
  await expect(sourceRow).toContainText("可用", { timeout: 15_000 });

  await sourceRow.getByRole("button", { name: "删除" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "永久删除知识来源",
  });
  await expect(confirmation).toContainText(
    "正文、知识版本、内容单元和向量将被永久删除，且不可恢复。",
  );
  await confirmation.getByRole("button", { name: "取消" }).click();
  await expect(confirmation).toBeHidden();
  await expect(sourceRow).toBeVisible();

  await sourceRow.getByRole("button", { name: "删除" }).click();
  await confirmation
    .getByRole("button", { name: "确认永久删除" })
    .click();
  await expect(sourceRow).toBeHidden();
});

test("管理员可以在知识来源处理期间确认永久删除", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");
  await page.getByRole("button", { name: "添加知识来源" }).click();
  await page.getByRole("tab", { name: "手工内容" }).click();
  await page
    .getByLabel("标题", { exact: true })
    .fill("处理期间删除的演示知识来源");
  await page
    .getByLabel("正文", { exact: true })
    .fill(repeatLifecycleBody("处理期间永久删除"));

  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: "处理期间删除的演示知识来源" });
  const processingObserved = sourceRow
    .getByText("处理中", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "确认添加" }).click();
  await processingObserved;

  await sourceRow.getByRole("button", { name: "删除" }).click();
  await page
    .getByRole("alertdialog", { name: "永久删除知识来源" })
    .getByRole("button", { name: "确认永久删除" })
    .click();
  await expect(sourceRow).toBeHidden();
  await page.waitForTimeout(1_000);
  await expect(sourceRow).toBeHidden();
});

test("管理员可用键盘操作添加知识来源浮层且焦点不会离开", async ({
  page,
  request,
}) => {
  await signInAsAdministrator(page, request);
  await page.goto("/admin/knowledge-sources");

  const trigger = page.getByRole("button", { name: "添加知识来源" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const sheet = page.getByRole("dialog", { name: "添加知识来源" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAccessibleDescription(
    "导入公开网页或粘贴手工内容，处理完成后即可参与回答。",
  );
  await sheet.getByRole("tab", { name: "手工内容" }).click();
  const bodyField = sheet.getByLabel("正文", { exact: true });
  await expect(bodyField).toHaveAttribute(
    "aria-describedby",
    "source-body-description",
  );
  await expect(sheet.locator("#source-body-description")).toContainText(
    "支持 80 至 50000 个字符",
  );

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    await expect(sheet.locator(":focus")).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("360px 下管理员可使用移动导航且主要操作目标不小于 40px", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signInAsAdministrator(page, request);

  const navigationTrigger = page.getByRole("button", { name: "打开导航" });
  await expect(navigationTrigger).toBeVisible();
  await expectTargetToBeAtLeast40Pixels(navigationTrigger);

  await navigationTrigger.click();
  const navigationSheet = page.getByRole("dialog", { name: "后台导航" });
  await expect(navigationSheet).toBeVisible();
  await expect(
    navigationSheet.getByRole("link", { name: "概览" }),
  ).toHaveAttribute("aria-current", "page");

  await navigationSheet
    .getByRole("link", { name: "知识来源", exact: true })
    .click();
  await expect(navigationSheet).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/knowledge-sources$/);

  const addSource = page.getByRole("button", { name: "添加知识来源" });
  await expectTargetToBeAtLeast40Pixels(addSource);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await addSource.click();
  const addSourceSheet = page.getByRole("dialog", {
    name: "添加知识来源",
  });
  await addSourceSheet.getByRole("tab", { name: "手工内容" }).click();
  await expect(addSourceSheet.getByLabel("标题", { exact: true })).toBeVisible();
  await expect(addSourceSheet.getByLabel("正文", { exact: true })).toBeVisible();
  await expect(
    addSourceSheet.getByLabel("原始 URL（可选）", { exact: true }),
  ).toBeVisible();
  await expectTargetToBeAtLeast40Pixels(
    addSourceSheet.getByRole("button", { name: "取消" }),
  );
  await expectTargetToBeAtLeast40Pixels(
    addSourceSheet.getByRole("button", { name: "确认添加" }),
  );
});

async function expectTargetToBeAtLeast40Pixels(
  target: ReturnType<Page["getByRole"]>,
) {
  const layoutFloatTolerance = 0.00001;
  const box = await target.boundingBox();

  expect(box).not.toBeNull();
  expect(box!.width + layoutFloatTolerance).toBeGreaterThanOrEqual(40);
  expect(box!.height + layoutFloatTolerance).toBeGreaterThanOrEqual(40);
}

function repeatLifecycleBody(action: string) {
  return [
    "## 生命周期说明",
    "",
    `这是用于验证${action}的演示正文，系统应保留当前知识版本、内容单元和向量，不重新执行处理流程。`,
    "",
    "管理员完成操作后，列表状态与概览中的可用知识来源数量应立即保持一致。",
  ].join("\n");
}
