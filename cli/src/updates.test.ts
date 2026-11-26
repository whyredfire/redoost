import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { version } from "../package.json";
import {
  bin,
  fakeServer,
  folder,
  runtime,
  setup,
  writeFiles,
} from "./cli.test-utils";
import {
  cachedServerVersion,
  checkEvery,
  installedWith,
  newerRelease,
  release,
} from "./updates";

const nextRelease = () => {
  const current = release(version);

  return `${current?.major}.${(current?.minor ?? 0) + 1}.0`;
};

const script = (root: string) =>
  path.join(root, "redoost", "dist", "redoost.js");

test.each([
  [nextRelease(), nextRelease()],
  [`${nextRelease()}-3-gabc1234`, nextRelease()],
  [`${version}-3-gabc1234`, null],
  ["0.0.1", null],
  ["dev", null],
  [null, null],
])("newer than %p: %p", (available, expected) => {
  expect(newerRelease(available)).toBe(expected);
});

test("checks at most daily", async () => {
  const server = fakeServer();
  server.state.release = { version: "9.0.0" };
  const cache = path.join(folder(), "updates.json");

  expect(await cachedServerVersion(server.url, cache)).toBe("9.0.0");
  expect(await cachedServerVersion(server.url, cache)).toBe("9.0.0");
  expect(server.routes()).toHaveLength(1);

  const checked = JSON.parse(readFileSync(cache, "utf-8"));
  checked[server.url].checked -= checkEvery;
  writeFileSync(cache, JSON.stringify(checked));
  await cachedServerVersion(server.url, cache);

  expect(server.routes()).toHaveLength(2);
});

test("update when up to date", async () => {
  const context = setup();
  context.server.state.release = { version };

  const run = await context.run(["update"]);
  const json = await context.run(["update", "--json"]);

  expect(run.out).toBe(`redoost ${version} is up to date\n`);
  expect(JSON.parse(json.out)).toEqual({ version, updated: false });
});

test.each([{ version: "dev" }, null])(
  "update needs the server's version: %p",
  async (found) => {
    const context = setup();
    context.server.state.release = found;

    expect(await context.fail(["update"])).toBe(
      `error: Couldn't tell which version ${context.server.url} runs.\n`
    );
  }
);

test("finds the package manager that installed the CLI", () => {
  const roots = { npm: path.resolve("/npm"), bun: path.resolve("/bun") };

  expect(installedWith(script(roots.npm), roots)).toBe("npm");
  expect(installedWith(script(roots.bun), roots)).toBe("bun");
  expect(installedWith(script(path.resolve("/npm-other")), roots)).toBeNull();
  expect(installedWith(script(roots.npm), { npm: null, bun: null })).toBeNull();
});

const fakeNpm = (root: string) => {
  const tools = folder();
  const log = path.join(tools, "npm.log");
  writeFiles(tools, {
    npm: `#!/bin/sh\nif [ "$1" = root ]; then echo "${root}"; else echo "$@" > "${log}"; fi\n`,
  });
  chmodSync(path.join(tools, "npm"), 0o755);

  return {
    log,
    env: { PATH: `${tools}:${process.env.PATH}`, BUN_INSTALL: tools },
  };
};

test.skipIf(process.platform === "win32")(
  "update reinstalls with the package manager that installed it",
  async () => {
    const context = setup();
    const newer = nextRelease();
    context.server.state.release = { version: newer };
    const root = folder();
    writeFiles(root, {
      "redoost/package.json": '{"type": "module"}',
      "redoost/dist/redoost.js": "",
    });
    copyFileSync(bin, script(root));
    const npm = fakeNpm(root);

    const child = Bun.spawn(
      [runtime, script(root), "update", "--server", context.server.url],
      {
        env: { ...process.env, ...npm.env },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [out, code] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);

    expect(code).toBe(0);
    expect(out).toBe(`Updated to redoost ${newer}\n`);
    expect(readFileSync(npm.log, "utf-8")).toBe(
      `install -g redoost@${newer}\n`
    );
  }
);

test.skipIf(process.platform === "win32")(
  "update says how to install when it can't tell how it was installed",
  async () => {
    const context = setup();
    const newer = nextRelease();
    context.server.state.release = { version: newer };

    const err = await context.fail(["update"], fakeNpm(folder()).env);

    expect(err).toContain(`npm install -g redoost@${newer}`);
    expect(err).toContain(`bun add -g redoost@${newer}`);
  }
);
