import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { isIPv4 } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

export function isPrivateIpv4(host) {
  if (!isIPv4(host)) return false;
  const [first, second] = host.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function parseServerOptions(args = [], environment = {}) {
  let host = "127.0.0.1";
  let port = parsePort(environment.PORT ?? 4174);
  let positionalPortSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--host") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--host requires a private IPv4 address");
      host = parsePrivateHost(value);
      index += 1;
    } else if (argument.startsWith("--host=")) {
      host = parsePrivateHost(argument.slice("--host=".length));
    } else if (argument === "--port") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--port requires a port number");
      port = parsePort(value);
      index += 1;
    } else if (argument.startsWith("--port=")) {
      port = parsePort(argument.slice("--port=".length));
    } else if (/^\d+$/.test(argument) && !positionalPortSeen) {
      // Backwards compatibility with the existing browser-check command.
      port = parsePort(argument);
      positionalPortSeen = true;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return { host, port, lanMode: host !== "127.0.0.1" };
}

export function createPreviewServer(rootDirectory = root) {
  return createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = normalize(join(rootDirectory, relativePath));

    if (!filePath.startsWith(rootDirectory)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("Not a file");
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

function parsePrivateHost(value) {
  if (!isPrivateIpv4(value)) {
    throw new Error("--host must be an RFC1918 private IPv4 address (10/8, 172.16/12, or 192.168/16)");
  }
  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("port must be an integer from 1 to 65535");
  }
  return port;
}

function runFromCommandLine() {
  let options;
  try {
    options = parseServerOptions(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(`Game #0004 preview error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const server = createPreviewServer();
  server.on("error", (error) => {
    console.error(`Game #0004 preview error: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(options.port, options.host, () => {
    const mode = options.lanMode ? "LAN test" : "local";
    console.log(`Game #0004 ${mode} preview: http://${options.host}:${options.port}`);
    if (options.lanMode) {
      console.log("Trusted LAN testing only. Do not configure router port forwarding.");
    }
  });
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) runFromCommandLine();
