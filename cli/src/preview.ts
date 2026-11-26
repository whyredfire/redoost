import { spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { createServer } from "node:http";
import { createInterface } from "node:readline";

import type { SiteFile } from "@redoost/shared";

const notFoundPage = `<!doctype html>
<meta charset="utf-8">
<title>Not found</title>
<h1>Not found</h1>
<p>This site has no page at this address.</p>
`;

const types = new Map(
  Object.entries({
    avif: "image/avif",
    css: "text/css",
    csv: "text/csv",
    gif: "image/gif",
    htm: "text/html",
    html: "text/html",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    map: "application/json",
    mjs: "text/javascript",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    otf: "font/otf",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    ttf: "font/ttf",
    txt: "text/plain",
    wasm: "application/wasm",
    webm: "video/webm",
    webmanifest: "application/manifest+json",
    webp: "image/webp",
    woff: "font/woff",
    woff2: "font/woff2",
    xml: "text/xml",
  })
);

/**
 * The type the API publishes a file with.
 * shortcut: common web types only, others are served as application/octet-stream; add any a site needs
 */
export const contentType = (file: string) =>
  types.get(file.split(".").pop()?.toLowerCase() ?? "") ??
  "application/octet-stream";

const decode = (target: string) => {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
};

/**
 * Answers a request the way published sites are served. Sites without a
 * 404.html are single-page apps, so routes without an extension get index.html.
 */
export const resolve = (files: Map<string, SiteFile>, target: string) => {
  const queryAt = target.indexOf("?");
  const rawPath = queryAt === -1 ? target : target.slice(0, queryAt);
  const query = queryAt === -1 ? "" : target.slice(queryAt + 1);
  const decoded = decode(rawPath);
  const trimmed = decoded.replace(/^\/+/u, "");
  const folder = trimmed === "" || trimmed.endsWith("/");
  const key = folder ? `${trimmed}index.html` : trimmed;
  const file = files.get(key);

  if (file) {
    return { status: 200, file };
  }

  if (files.has(`${key}/index.html`)) {
    return { status: 302, location: `${rawPath}/${query ? `?${query}` : ""}` };
  }

  const notFound = files.get("404.html");

  if (notFound) {
    return { status: 404, file: notFound };
  }

  const index = files.get("index.html");
  const name = decoded.split("/").pop() ?? "";

  return index && !name.includes(".")
    ? { status: 200, file: index }
    : { status: 404 };
};

/** Serves the site on host and port until the process ends. */
export const serve = async (files: SiteFile[], host: string, port: number) => {
  const byPath = new Map(files.map((file) => [file.path, file]));

  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(501).end();

      return;
    }

    const answer = resolve(byPath, request.url ?? "/");
    const html = "text/html; charset=utf-8";

    const body = answer.file
      ? Buffer.from(await answer.file.file.arrayBuffer())
      : Buffer.from(answer.location ? "" : notFoundPage);

    response
      .writeHead(answer.status, {
        "Content-Length": body.byteLength,
        "Content-Type": answer.file ? contentType(answer.file.path) : html,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
        ...(answer.location && { Location: answer.location }),
      })
      .end(body);
  });

  server.listen(port, host);
  await once(server, "listening");

  return server;
};

/** This machine's address on its network, if it has one; connecting UDP sends nothing, only picking the outgoing interface. */
export const networkAddress = async () => {
  const probe = createSocket("udp4");

  try {
    probe.connect(1, "10.255.255.255");
    await once(probe, "connect");

    return probe.address().address;
  } catch {
    return null;
  } finally {
    probe.close();
  }
};

/** Opens url in the default browser, resolving whether that worked. */
export const openBrowser = async (url: string) => {
  const commands = new Map([
    ["darwin", ["open", url]],
    ["win32", ["cmd", "/c", "start", "", url]],
  ]);

  const [command = "xdg-open", ...args] = commands.get(process.platform) ?? [
    "xdg-open",
    url,
  ];

  try {
    const [code] = await once(
      spawn(command, args, { stdio: "ignore" }),
      "exit"
    );

    return code === 0;
  } catch {
    return false;
  }
};

/** Opens url in a browser each time a line is typed, as when Enter is pressed. */
export const openOnEnter = (
  input: NodeJS.ReadableStream,
  url: string,
  open = openBrowser
) => {
  const lines = createInterface({ input });

  lines.on("line", async () => {
    if (!(await open(url))) {
      process.stderr.write(`Couldn't open a browser. Open ${url} yourself.\n`);
    }
  });

  return lines;
};
