import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const PREFIX = "/games/0006_traffic-panic/";
const ROOT = new URL("../", import.meta.url);
const HTML = "text/html; charset=utf-8";
const JS = "text/javascript; charset=utf-8";

export function createPreviewServer() {
  return createServer(async (request, response) => {
    const route = new URL(request.url, "http://127.0.0.1").pathname;
    if (route === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const file = route.startsWith(PREFIX) ? route.slice(PREFIX.length) || "index.html" : "";
    const type = file === "index.html" ? HTML : file === "styles.css" ? "text/css; charset=utf-8"
      : /^(ui|src)\/[a-z-]+\.mjs$/.test(file) || file === "simulation/experiment-configs.mjs" ? JS : null;
    if (type) {
      try {
        const body = await readFile(new URL(file, ROOT));
        response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(body);
        return;
      } catch (error) {
        if (error.code !== "ENOENT") {
          response.writeHead(500).end();
          return;
        }
      }
    }
    response.writeHead(404).end();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 8086);
  createPreviewServer().listen(port, "127.0.0.1", () => {
    console.log(`http://127.0.0.1:${port}${PREFIX}`);
  });
}
