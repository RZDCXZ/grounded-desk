import {
  expect,
  test,
  type FrameLocator,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { writeReleaseEvidence } from "../../scripts/release-evidence.ts";

test("云端公开页与嵌入入口通过有据回答、引用和下线状态冒烟", async ({
  browser,
  request,
}) => {
  const configuration = readCloudSmokeConfiguration();
  const supabase = createClient(
    configuration.supabaseUrl,
    configuration.supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const { data: assistant, error } = await supabase
    .from("assistants")
    .select("id, public_id, status")
    .single();

  expect(error).toBeNull();
  expect(assistant?.status).toBe("published");
  expect(assistant?.public_id).toBeTruthy();

  const assistantId = assistant!.id as string;
  const publicId = assistant!.public_id as string;
  const publicUrl = `${configuration.appUrl}/a/${publicId}`;
  const embedScriptUrl =
    `${configuration.appUrl}/api/public/assistants/${publicId}/embed.js`;
  let assistantTakenOffline = false;

  try {
    const context = await browser.newContext();
    const publicPage = await context.newPage();
    await publicPage.goto(publicUrl);
    await askGroundedQuestion(
      publicPage,
      configuration.question,
      configuration.expectedSourceTitle,
    );

    const embedHost = await context.newPage();
    await embedHost.setContent(
      `<!doctype html><html><body><main>GroundedDesk cloud smoke host</main><script async src="${escapeAttribute(embedScriptUrl)}"></script></body></html>`,
    );
    const launcher = embedHost.getByRole("button", { name: /^打开/u });
    await expect(launcher).toBeVisible();
    await launcher.click();
    const embeddedConversation = embedHost.frameLocator("iframe");
    await askGroundedQuestion(
      embeddedConversation,
      configuration.question,
      configuration.expectedSourceTitle,
    );
    await context.close();

    const { error: offlineError } = await supabase
      .from("assistants")
      .update({ status: "offline" })
      .eq("id", assistantId);
    expect(offlineError).toBeNull();
    assistantTakenOffline = true;

    await expect.poll(async () => {
      const response = await request.get(
        `${publicUrl}?cloud-smoke=${Date.now()}`,
      );
      return response.status();
    }).toBe(404);
    await expect.poll(async () => {
      const response = await request.get(
        `${embedScriptUrl}?cloud-smoke=${Date.now()}`,
      );
      return {
        body: await response.text(),
        status: response.status(),
      };
    }).toEqual({
      body: "/* 该助手当前不可公开访问。 */",
      status: 404,
    });
  } finally {
    if (assistantTakenOffline) {
      const { error: restoreError } = await supabase
        .from("assistants")
        .update({ status: "published" })
        .eq("id", assistantId);
      expect(restoreError).toBeNull();
    }
  }

  await writeReleaseEvidence("cloud-smoke", "passed", {
    publicPage: "passed",
    embed: "passed",
    offline: "passed",
    expectedSourceTitle: configuration.expectedSourceTitle,
  });
});

async function askGroundedQuestion(
  page: Page | FrameLocator,
  question: string,
  expectedSourceTitle: string,
) {
  await page.getByLabel("咨询问题").fill(question);
  await page.getByLabel("咨询问题").press("Enter");
  await expect(page.getByText("回答依据", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: new RegExp(escapeRegularExpression(expectedSourceTitle), "u"),
    }),
  ).toBeVisible();
  await expect(
    page.getByText("当前可用知识不足以支持这个问题的事实性回答。", {
      exact: true,
    }),
  ).toHaveCount(0);
}

function readCloudSmokeConfiguration() {
  const required = {
    appUrl: process.env.APP_URL,
    expectedSourceTitle: process.env.CLOUD_SMOKE_EXPECTED_SOURCE_TITLE,
    question: process.env.CLOUD_SMOKE_QUESTION,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`云端冒烟缺少配置：${missing.join("、")}`);
  }

  return Object.fromEntries(
    Object.entries(required).map(([name, value]) => [
      name,
      name === "appUrl" ? value!.replace(/\/$/u, "") : value!,
    ]),
  ) as { [Name in keyof typeof required]: string };
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
