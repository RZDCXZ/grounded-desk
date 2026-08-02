import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { readReleaseSourceRevision } from "../../scripts/release-evidence.ts";

const currentRevision = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();

test("发布证据默认读取真实 Git HEAD", () => {
  assert.match(currentRevision, /^[0-9a-f]{40}$/u);
  assert.equal(
    readReleaseSourceRevision({ NODE_ENV: "test" }),
    currentRevision,
  );
});

test("发布证据拒绝与真实 Git HEAD 不一致的人工 revision", () => {
  const incorrectRevision = currentRevision ===
      "1234567890abcdef1234567890abcdef12345678"
    ? "abcdef1234567890abcdef1234567890abcdef12"
    : "1234567890abcdef1234567890abcdef12345678";
  assert.throws(
    () =>
      readReleaseSourceRevision({
        NODE_ENV: "test",
        RELEASE_SOURCE_REVISION: incorrectRevision,
      }),
    /RELEASE_SOURCE_REVISION 与当前 Git HEAD 不一致/,
  );
});
