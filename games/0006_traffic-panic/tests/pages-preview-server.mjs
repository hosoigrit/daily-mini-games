import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PAGES_PREFIX = "/daily-mini-games/";
const docs = new URL("../../../docs/", import.meta.url);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export function createPagesPreviewServer() {
  return createServer(async (request, response) => {
    const path = request.url?.split("?", 1)[0] ?? "";
    if (path === "/favicon.ico") return response.writeHead(204).end();
    if (!["GET", "HEAD"].includes(request.method)) return response.writeHead(405).end();
    if (!path.startsWith(PAGES_PREFIX)) return response.writeHead(404).end();
    const tail = path.slice(PAGES_PREFIX.length);
    const rel = path.endsWith("/") ? tail + "index.html" : tail;
    if (!rel.split("/").every((part) => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))) {
      return response.writeHead(404).end();
    }
    const type = mime[extname(rel)];
    if (!type) return response.writeHead(404).end();
    try {
      const body = await readFile(new URL(rel, docs));
      return response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(body);
    } catch (error) {
      const missing = error.code === "ENOENT" || error.code === "EISDIR";
      return response.writeHead(missing ? 404 : 500).end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 8096);
  createPagesPreviewServer().listen(port, "127.0.0.1", () => {
    console.log("http://127.0.0.1:" + port + PAGES_PREFIX);
  });
}
