import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.PREVIEW_HOST || "127.0.0.1";
const requestedPort = Number(process.env.PREVIEW_PORT || 4173);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65_535
  ? requestedPort
  : 4173;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const filePath = path.resolve(rootDirectory, relativePath);

    if (filePath !== rootDirectory && !filePath.startsWith(`${rootDirectory}${path.sep}`)) {
      sendText(response, 403, "Forbidden");
      return;
    }

    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch {
    sendText(response, 404, "Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Target Tap preview: http://${host}:${port}/`);
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.log("LAN preview only: do not use port forwarding or expose this server to the internet.");
  }
});

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(message);
}
