import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mountPath = "/games/0005_hitofude-delivery/";
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

export function createPreviewServer(rootDirectory = root) {
  const resolvedRoot = resolve(rootDirectory);
  return createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const mountedPath = pathname.startsWith(mountPath) ? pathname.slice(mountPath.length) : pathname.replace(/^\/+/, "");
    const relativePath = mountedPath === "" || mountedPath === "/" ? "index.html" : mountedPath.replace(/^\/+/, "");
    const filePath = resolve(normalize(resolve(resolvedRoot, relativePath)));
    if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
      response.writeHead(200, {
        "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

function runFromCommandLine() {
  const port = Number(process.argv[2] || 4175);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Game #0005 preview error: port must be an integer from 1 to 65535");
    process.exitCode = 1;
    return;
  }
  const server = createPreviewServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Game #0005 local preview: http://127.0.0.1:${port}${mountPath}`);
  });
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runFromCommandLine();

