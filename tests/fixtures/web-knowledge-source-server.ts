import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 4173;

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }

  const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (requestUrl.pathname === "/article") {
    const requestedMarker = requestUrl.searchParams.get("marker");
    const marker =
      requestedMarker && /^[A-Z0-9-]{1,80}$/.test(requestedMarker)
        ? requestedMarker
        : null;
    const title = marker
      ? `受控网页服务说明 ${marker}`
      : "受控网页服务说明";
    const markerText = marker ? `${marker} `.repeat(24) : "";

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`
      <!doctype html>
      <html>
        <head>
          <title>${title}</title>
          <style>body { color: red }</style>
          <script>globalThis.shouldNeverRun = true</script>
        </head>
        <body>
          <nav>演示首页 产品 登录</nav>
          <main>
            <h1>${title}</h1>
            <p>${markerText}</p>
            <p>这是浏览器测试使用的固定公开网页正文，用于验证管理员可以安全导入页面标题、主要正文并形成可用知识来源。</p>
            <h2>响应方式</h2>
            <p>我们提供知识整理、来源核查和有据回答配置服务。工作日的问题会在两个工作小时内确认，管理员可以依据保留的原始地址核查这项演示知识来源。</p>
            <form><input name="private-field"></form>
          </main>
          <footer>版权信息和页脚导航</footer>
        </body>
      </html>
    `);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});

server.listen(port, host);

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
