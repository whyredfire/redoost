import { expect, test } from "bun:test";
import { once } from "node:events";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

import { setup, writeFiles } from "./cli.test-utils";
import { readSite } from "./files";
import { openOnEnter, resolve, serve } from "./preview";

const page = (file: string, content = file) => ({
  path: file,
  file: new Blob([content]),
});

const pages = () =>
  new Map(
    ["index.html", "app.js", "docs/index.html"].map((file) => [
      file,
      page(file),
    ])
  );

test.each([
  ["/", 200, "index.html"],
  ["/app.js?v=1", 200, "app.js"],
  ["/docs/", 200, "docs/index.html"],
  ["/dashboard/settings", 200, "index.html"],
  ["/missing.png", 404, undefined],
])("single-page apps: %s", (target, status, served) => {
  const answer = resolve(pages(), target);

  expect([answer.status, answer.file?.path]).toEqual([status, served]);
});

test("folders redirect to their index", () => {
  expect(resolve(pages(), "/docs?page=2")).toEqual({
    status: 302,
    location: "/docs/?page=2",
  });
});

test.each(["/dashboard", "/missing.png"])(
  "sites with a 404 page show it: %s",
  (target) => {
    const files = pages();
    const notFound = page("404.html", "gone");
    files.set("404.html", notFound);

    expect(resolve(files, target)).toEqual({ status: 404, file: notFound });
  }
);

test("paths are decoded", () => {
  const files = new Map([["my page.html", page("my page.html", "hi")]]);

  expect(resolve(files, "/my%20page.html").status).toBe(200);
});

test("server", async () => {
  const context = setup();
  writeFiles(context.home, {
    "index.html": "<h1>Home</h1>",
    "style.css": "h1 {}",
  });
  const server = await serve(await readSite(context.home), "127.0.0.1", 0);
  // SAFETY: a server listening on a host and port has an IP address
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  const [home, style, missing, posted] = await Promise.all([
    fetch(`${url}/about`),
    fetch(`${url}/style.css`),
    fetch(`${url}/missing.png`),
    fetch(url, { method: "POST" }),
  ]);

  server.close();

  expect(home.headers.get("Cache-Control")).toBe("no-cache");
  expect(await home.text()).toBe("<h1>Home</h1>");
  expect(style.headers.get("Content-Type")).toBe("text/css");
  expect(missing.status).toBe(404);
  expect(await missing.text()).toContain("Not found");
  expect(posted.status).toBe(501);
});

const firstLine = async (args: string[] = []) => {
  const context = setup();
  writeFiles(context.home, { "index.html": "<h1>Home</h1>" });
  const preview = context.spawn(["preview", context.home, ...args]);
  const decoder = new TextDecoder();
  let text = "";

  for await (const chunk of preview.stdout) {
    text += decoder.decode(chunk);

    if (text.includes("\n")) {
      break;
    }
  }

  preview.kill();
  await preview.exited;

  return text.slice(0, text.indexOf("\n") + 1);
};

test("preview command", async () => {
  const printed = JSON.parse(await firstLine(["--host", "0.0.0.0", "--json"]));
  const port = printed.url.split(":").at(-1);

  expect(printed.url).toBe(`http://127.0.0.1:${port}`);
  expect(printed.network_url ?? `http://none:${port}`).toMatch(
    new RegExp(`^http://.+:${port}$`, "u")
  );
});

test("preview without a terminal only prints", async () => {
  const line = await firstLine();

  expect(line).toStartWith("Previewing at http://127.0.0.1:");
  expect(line).toEndWith(" (Ctrl+C to stop)\n");
});

test.each([true, false])(
  "enter opens the browser, which opens: %p",
  async (opens) => {
    const opened: string[] = [];

    const lines = openOnEnter(
      Readable.from(["\n\n"]),
      "http://127.0.0.1:1",
      (url) => {
        opened.push(url);

        return Promise.resolve(opens);
      }
    );

    await once(lines, "close");

    expect(opened).toEqual(["http://127.0.0.1:1", "http://127.0.0.1:1"]);
  }
);

test("ports in use", async () => {
  const context = setup();
  writeFiles(context.home, { "index.html": "<h1>Home</h1>" });
  const taken = createServer().listen(0, "127.0.0.1");
  await once(taken, "listening");
  // SAFETY: a server listening on a host and port has an IP address
  const { port } = taken.address() as AddressInfo;

  const err = await context.fail([
    "preview",
    context.home,
    "--port",
    String(port),
  ]);

  taken.close();

  expect(err).toStartWith(`error: Couldn't listen on 127.0.0.1:${port}`);
});
