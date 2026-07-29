import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 4174;
const page = await readFile(
  new URL("../tests/fixtures/embed-host.html", import.meta.url),
  "utf8",
);

const server = createServer((request, response) => {
  if (request.url === "/" || request.url?.startsWith("/?")) {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(page);
    return;
  }

  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found");
});

server.listen(port, host, () => {
  console.log(`嵌入效果手动测试页：http://${host}:${port}`);
});

function closeServer() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
