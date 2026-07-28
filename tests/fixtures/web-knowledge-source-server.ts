import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 4173;

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }

  if (request.url === "/article") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`
      <!doctype html>
      <html>
        <head>
          <title>受控网页服务说明</title>
          <style>body { color: red }</style>
          <script>globalThis.shouldNeverRun = true</script>
        </head>
        <body>
          <nav>演示首页 产品 登录</nav>
          <main>
            <h1>受控网页服务说明</h1>
            <p>这是浏览器测试使用的固定公开网页正文，用于验证管理员可以安全导入页面标题、主要正文并形成可用知识来源。</p>
            <h2>响应方式</h2>
            <p>工作日的问题会在两个工作小时内确认，管理员可以依据保留的原始地址核查这项演示知识来源。</p>
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
