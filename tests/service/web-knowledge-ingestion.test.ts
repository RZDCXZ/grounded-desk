import assert from "node:assert/strict";
import test from "node:test";

import {
  createPinnedWebLookup,
  fetchWebKnowledgePage,
  type WebFetchDependencies,
} from "../../src/lib/knowledge/fetch-web-page.ts";
import { processWebKnowledgeRevision } from "../../src/lib/knowledge/process-web.ts";
import type { CompletedKnowledgeRevision } from "../../src/lib/knowledge/process-revision.ts";

function controlledWeb(
  html: string,
  overrides: Partial<WebFetchDependencies> = {},
): WebFetchDependencies {
  return {
    allowPrivateAddresses: false,
    environment: "test",
    async resolveHostname() {
      return [{ address: "93.184.216.34", family: 4 }];
    },
    async request() {
      return {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: (async function* () {
          yield Buffer.from(html);
        })(),
      };
    },
    ...overrides,
  };
}

test("固定 HTML 会保留页面标题和主要正文并移除页面噪声", async () => {
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/service",
    controlledWeb(`
      <!doctype html>
      <html>
        <head>
          <title>演示服务说明</title>
          <style>.hidden { display: none }</style>
          <script>globalThis.compromised = true</script>
        </head>
        <body>
          <nav>首页 产品 定价 登录</nav>
          <main>
            <h1>演示服务说明</h1>
            <p>我们提供来源核查、知识整理和有据回答配置服务。</p>
            <h2>响应方式</h2>
            <p>工作日的问题会在两个工作小时内确认。</p>
            <form><label>邮箱<input name="email"></label></form>
          </main>
          <footer>版权信息和站点导航</footer>
        </body>
      </html>
    `),
  );

  assert.deepEqual(result, {
    status: "success",
    page: {
      title: "演示服务说明",
      body: [
        "# 演示服务说明",
        "",
        "我们提供来源核查、知识整理和有据回答配置服务。",
        "",
        "## 响应方式",
        "",
        "工作日的问题会在两个工作小时内确认。",
      ].join("\n"),
      finalUrl: "https://docs.example.com/service",
    },
  });
});

test("缺少语义 main 或 article 时仍会移除非语义导航和侧栏噪声", async () => {
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/plain-layout",
    controlledWeb(`
      <html>
        <head><title>普通布局服务说明</title></head>
        <body>
          <div class="site-navigation">
            <p>首页、产品、价格、登录、注册</p>
          </div>
          <div class="article-body">
            <h1>普通布局服务说明</h1>
            <p>这是没有使用语义 main 或 article 标签的主要正文，仍应作为知识来源被完整保留。</p>
            <p>管理员可以核查标题、正文和原始地址，并观察知识版本完成处理。</p>
          </div>
          <aside>
            <p>热门推荐、广告和站内链接</p>
          </aside>
          <div class="site-footer">
            <p>版权、隐私政策和站点地图</p>
          </div>
        </body>
      </html>
    `),
  );

  assert.equal(result.status, "success");
  const body = result.status === "success" ? result.page.body : "";
  assert.match(body, /没有使用语义 main/);
  assert.match(body, /管理员可以核查标题/);
  assert.doesNotMatch(body, /登录、注册|热门推荐|版权、隐私政策/);
});

test("页面只有导航和页脚噪声时返回无法识别主要正文", async () => {
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/no-content",
    controlledWeb(`
      <html>
        <head><title>空白演示页面</title></head>
        <body>
          <div class="site-navigation"><p>首页、产品、登录</p></div>
          <div class="site-footer"><p>版权和隐私政策</p></div>
        </body>
      </html>
    `),
  );

  assert.deepEqual(result, {
    status: "failed",
    kind: "invalid-content",
    reason: "网页中没有可识别的主要正文，无法导入。",
  });
});

test("文章内部 header 的标题和摘要会作为主要正文保留", async () => {
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/article-header",
    controlledWeb(`
      <html>
        <head><title>文章页面</title></head>
        <body>
          <header role="banner"><p>站点名称和全局入口</p></header>
          <article>
            <header class="header">
              <h1>文章内的演示服务标题</h1>
              <p>这段文章摘要解释了服务范围和适用场景，应当随主要正文一起保留。</p>
            </header>
            <p>文章正文说明管理员可以核查知识来源，并用完整内容支持后续有据回答。</p>
          </article>
        </body>
      </html>
    `),
  );

  assert.equal(result.status, "success");
  const body = result.status === "success" ? result.page.body : "";
  assert.match(body, /文章内的演示服务标题/);
  assert.match(body, /这段文章摘要/);
  assert.match(body, /文章正文说明管理员/);
  assert.doesNotMatch(body, /站点名称和全局入口/);
});

test("本机、私网、保留地址、云元数据地址和解析到它们的主机在请求前被拒绝", async () => {
  let requestCount = 0;
  const blockedAddresses = [
    "127.0.0.1",
    "10.0.0.8",
    "192.0.2.10",
    "169.254.169.254",
    "::1",
    "fc00::1",
  ];

  for (const address of blockedAddresses) {
    const result = await fetchWebKnowledgePage(
      "https://docs.example.com/service",
      controlledWeb("", {
        async resolveHostname() {
          return [
            {
              address,
              family: address.includes(":") ? 6 : 4,
            } as const,
          ];
        },
        async request() {
          requestCount += 1;
          throw new Error("被阻止的地址不应发出请求");
        },
      }),
    );

    assert.deepEqual(result, {
      status: "failed",
      kind: "blocked-address",
      reason: "该网页地址指向本机、私网或保留网络，无法导入。",
    });
  }

  const directAddressResult = await fetchWebKnowledgePage(
    "http://127.0.0.1/admin",
    controlledWeb("", {
      async resolveHostname() {
        assert.fail("直接 IP 地址不需要 DNS 解析");
      },
    }),
  );

  assert.equal(requestCount, 0);
  assert.equal(directAddressResult.status, "failed");
  assert.equal(
    directAddressResult.status === "failed"
      ? directAddressResult.kind
      : undefined,
    "blocked-address",
  );
});

test("每次重定向都会重新解析主机并拒绝 DNS 变化后的私网地址", async () => {
  let resolutionCount = 0;
  let requestCount = 0;

  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/start",
    controlledWeb("", {
      async resolveHostname() {
        resolutionCount += 1;
        return resolutionCount === 1
          ? [{ address: "93.184.216.34", family: 4 }]
          : [{ address: "127.0.0.1", family: 4 }];
      },
      async request() {
        requestCount += 1;
        return {
          status: 302,
          headers: { location: "/private-target" },
          body: (async function* () {})(),
        };
      },
    }),
  );

  assert.deepEqual(result, {
    status: "failed",
    kind: "blocked-address",
    reason: "该网页地址指向本机、私网或保留网络，无法导入。",
  });
  assert.equal(resolutionCount, 2);
  assert.equal(requestCount, 1);
});

test("非 HTML 响应在读取正文前被拒绝并给出可理解结果", async () => {
  let bodyRead = false;
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/guide.pdf",
    controlledWeb("", {
      async request() {
        return {
          status: 200,
          headers: { "content-type": "application/pdf" },
          body: (async function* () {
            bodyRead = true;
            yield Buffer.from("%PDF");
          })(),
        };
      },
    }),
  );

  assert.deepEqual(result, {
    status: "failed",
    kind: "unsupported-content-type",
    reason: "该地址返回的不是 HTML 网页，无法导入。",
  });
  assert.equal(bodyRead, false);
});

test("响应正文超过限制时立即停止读取并返回安全失败结果", async () => {
  let cancelled = false;
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/oversized",
    controlledWeb("", {
      async request() {
        return {
          status: 200,
          headers: { "content-type": "text/html" },
          body: (async function* () {
            yield Buffer.alloc(700_000, "a");
            yield Buffer.alloc(700_000, "b");
            assert.fail("超过限制后不应继续读取响应正文");
          })(),
          cancel() {
            cancelled = true;
          },
        };
      },
    }),
  );

  assert.deepEqual(result, {
    status: "failed",
    kind: "too-large",
    reason: "网页响应超过 1 MB 的导入限制。",
  });
  assert.equal(cancelled, true);
});

test("网页请求超时时返回可理解结果且不暴露底层错误", async () => {
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/slow",
    controlledWeb("", {
      async request() {
        throw new DOMException(
          "socket timeout at internal gateway with token secret-123",
          "TimeoutError",
        );
      },
    }),
  );

  assert.deepEqual(result, {
    status: "failed",
    kind: "timeout",
    reason: "网页响应超时，请稍后重试。",
  });
  assert.doesNotMatch(
    result.status === "failed" ? result.reason : "",
    /gateway|secret-123|socket/iu,
  );
});

test("DNS 解析与全部重定向共享同一个总超时", async () => {
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/slow-dns",
    controlledWeb("", {
      timeoutMilliseconds: 5,
      async resolveHostname() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [{ address: "93.184.216.34", family: 4 }];
      },
    }),
  );

  assert.deepEqual(result, {
    status: "failed",
    kind: "timeout",
    reason: "网页响应超时，请稍后重试。",
  });
});

test("网页拒绝公开访问时不会读取或尝试绕过登录和反爬限制", async () => {
  let bodyRead = false;
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/members-only",
    controlledWeb("", {
      async request() {
        return {
          status: 403,
          headers: { "content-type": "text/html" },
          body: (async function* () {
            bodyRead = true;
            yield Buffer.from("internal anti-bot details");
          })(),
        };
      },
    }),
  );

  assert.deepEqual(result, {
    status: "failed",
    kind: "http-status",
    reason:
      "该网页拒绝公开访问（HTTP 403），系统不会尝试绕过登录、验证码、付费墙或反爬限制。",
  });
  assert.equal(bodyRead, false);
});

test("重定向超过五次时停止请求", async () => {
  let requestCount = 0;
  const result = await fetchWebKnowledgePage(
    "https://docs.example.com/redirect-0",
    controlledWeb("", {
      async request({ url }) {
        requestCount += 1;
        const step = Number(url.pathname.split("-").at(-1));
        return {
          status: 302,
          headers: { location: `/redirect-${step + 1}` },
          body: (async function* () {})(),
        };
      },
    }),
  );

  assert.deepEqual(result, {
    status: "failed",
    kind: "redirect",
    reason: "网页重定向次数超过 5 次或目标无效，无法导入。",
  });
  assert.equal(requestCount, 6);
});

test("私有来源开关仅在开发环境生效", async () => {
  let requestCount = 0;
  const privateSource = controlledWeb(`
    <html><head><title>本地演示知识</title></head>
    <body><main><p>仅供本地开发测试的演示知识正文。</p></main></body></html>
  `, {
    allowPrivateAddresses: true,
    async resolveHostname() {
      return [{ address: "127.0.0.1", family: 4 }];
    },
    async request() {
      requestCount += 1;
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: (async function* () {
          yield Buffer.from(
            "<html><head><title>本地演示知识</title></head><body><main><p>仅供本地开发测试的演示知识正文。</p></main></body></html>",
          );
        })(),
      };
    },
  });

  const developmentResult = await fetchWebKnowledgePage(
    "http://localhost:4173/guide",
    { ...privateSource, environment: "development" },
  );
  const productionResult = await fetchWebKnowledgePage(
    "http://localhost:4173/guide",
    { ...privateSource, environment: "production" },
  );
  const testResult = await fetchWebKnowledgePage(
    "http://localhost:4173/guide",
    { ...privateSource, environment: "test" },
  );

  assert.equal(developmentResult.status, "success");
  assert.deepEqual(productionResult, {
    status: "failed",
    kind: "blocked-address",
    reason: "该网页地址指向本机、私网或保留网络，无法导入。",
  });
  assert.deepEqual(testResult, productionResult);
  assert.equal(requestCount, 1);
});

test("固定地址请求兼容 Node 多地址查询回调", async () => {
  const address = { address: "198.18.0.5", family: 4 } as const;
  const lookup = createPinnedWebLookup(address);
  const result = await new Promise<unknown>((resolve, reject) => {
    lookup("example.com", { all: true }, (error, resolvedAddress) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(resolvedAddress);
    });
  });

  assert.deepEqual(result, [address]);
});

test("提取成功的网页通过与手工内容一致的链路形成可用知识版本", async () => {
  let preparedRevision:
    | { id: string; title: string; body: string }
    | undefined;
  let completedRevision: CompletedKnowledgeRevision | undefined;
  const embeddedTexts: string[][] = [];

  const result = await processWebKnowledgeRevision(
    {
      id: "web-revision-1",
      originalUrl: "https://docs.example.com/service",
    },
    {
      async fetchPage() {
        return {
          status: "success",
          page: {
            title: "演示网页服务说明",
            body: [
              "# 服务范围",
              "",
              "我们为演示网站提供知识整理、来源核查和有据回答配置服务，管理员可以持续维护业务内容。",
              "",
              "## 响应方式",
              "",
              "工作日的问题会在两个工作小时内确认，紧急情况请使用知识来源中列出的人工联系入口。",
            ].join("\n"),
            finalUrl: "https://docs.example.com/service",
          },
        };
      },
      async prepareRevision(revision) {
        preparedRevision = revision;
      },
      embeddingProvider: {
        async embed(texts) {
          embeddedTexts.push(texts);
          return texts.map(() => [0.1, 0.2]);
        },
      },
      revisionRepository: {
        async complete(revision) {
          completedRevision = revision;
        },
        async fail() {
          assert.fail("有效网页不应进入失败分支");
        },
      },
    },
  );

  assert.deepEqual(preparedRevision, {
    id: "web-revision-1",
    title: "演示网页服务说明",
    body: [
      "# 服务范围",
      "",
      "我们为演示网站提供知识整理、来源核查和有据回答配置服务，管理员可以持续维护业务内容。",
      "",
      "## 响应方式",
      "",
      "工作日的问题会在两个工作小时内确认，紧急情况请使用知识来源中列出的人工联系入口。",
    ].join("\n"),
  });
  assert.equal(result.status, "available");
  assert.equal(completedRevision?.id, "web-revision-1");
  assert.equal(completedRevision?.contentUnits.length, 2);
  assert.match(completedRevision?.contentUnits[0]?.content ?? "", /网页服务说明/);
  assert.deepEqual(
    embeddedTexts,
    [completedRevision?.contentUnits.map(({ content }) => content)],
  );
});
