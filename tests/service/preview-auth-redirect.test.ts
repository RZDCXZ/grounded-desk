import assert from "node:assert/strict";
import test from "node:test";

import {
  getApplicationUrl,
  getAuthConfirmationUrl,
} from "../../src/lib/server-config.ts";

const previewEnvironment = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_BRANCH_URL:
    "grounded-desk-git-feature-auth-rzdcxzs-projects.vercel.app",
  APP_URL:
    "https://grounded-desk-git-codex-add-github-actions-ci-rzdcxzs-projects.vercel.app",
} satisfies NodeJS.ProcessEnv;

test("Preview Magic Link 使用当前 Vercel 分支地址而不是固定 APP_URL", () => {
  assert.equal(
    getApplicationUrl(previewEnvironment),
    "https://grounded-desk-git-feature-auth-rzdcxzs-projects.vercel.app",
  );
  assert.equal(
    getAuthConfirmationUrl(previewEnvironment),
    "https://grounded-desk-git-feature-auth-rzdcxzs-projects.vercel.app/auth/confirm",
  );
});

test("Preview 缺少可信 Vercel 系统标记时不会退回固定 APP_URL", () => {
  assert.throws(
    () =>
      getApplicationUrl({
        ...previewEnvironment,
        VERCEL: undefined,
      }),
    /VERCEL=1/,
  );
  assert.throws(
    () =>
      getApplicationUrl({
        ...previewEnvironment,
        VERCEL_TARGET_ENV: "production",
      }),
    /VERCEL_TARGET_ENV=preview/,
  );
  assert.throws(
    () =>
      getApplicationUrl({
        ...previewEnvironment,
        VERCEL_PROJECT_PRODUCTION_URL:
          previewEnvironment.VERCEL_BRANCH_URL,
      }),
    /不能等于 Production 地址/,
  );
});

test("Preview 只接受 Vercel 注入的裸 vercel.app 分支主机名", () => {
  for (const invalidBranchUrl of [
    "https://grounded-desk-git-feature-auth-rzdcxzs-projects.vercel.app",
    "grounded-desk-git-feature-auth-rzdcxzs-projects.vercel.app/redirect",
    "grounded-desk-git-feature-auth-rzdcxzs-projects.vercel.app.evil.example",
    "evil.example",
  ]) {
    assert.throws(
      () =>
        getApplicationUrl({
          ...previewEnvironment,
          VERCEL_BRANCH_URL: invalidBranchUrl,
        }),
      /VERCEL_BRANCH_URL/,
    );
  }
});

test("Production 继续只使用显式 APP_URL", () => {
  assert.equal(
    getApplicationUrl({
      ...previewEnvironment,
      VERCEL_ENV: "production",
      VERCEL_TARGET_ENV: "production",
      APP_URL: "https://groundeddesk.example.com/admin",
    }),
    "https://groundeddesk.example.com",
  );
});
