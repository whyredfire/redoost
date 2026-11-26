import { describe, expect, test } from "bun:test";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";

import { prepareFiles } from "@redoost/shared";

import { version } from "../package.json";
import { setup, storedSite, user, writeFiles } from "./cli.test-utils";
import { siteLine } from "./commands";
import { readSite } from "./files";

const siteWith = (files: Record<string, string>) => {
  const context = setup();
  context.signIn();
  const site = path.join(context.home, "site");
  writeFiles(site, files);

  return { ...context, site };
};

const output = async (run: Promise<{ out: string }>) => {
  const { out } = await run;

  return out;
};

describe("signing in", () => {
  test("login waits for approval", async () => {
    const context = setup();

    const run = await context.run(["login"]);

    expect(run.err).toContain(`${context.server.url}/cli/link`);
    expect(run.out).toBe("Signed in as ada@example.com\n");
    const polls = context.server.sent("POST /api/auth/cli/link/token");
    expect(polls).toHaveLength(2);
    expect(polls[1]).toEqual({
      secret: "secret",
      name: `CLI on ${hostname()}`,
    });
    expect(await context.tokens()).toEqual({ [context.server.url]: "token" });
  });

  test("login with a token", async () => {
    const context = setup();

    const run = await context.run(["login", "--token", "token"]);

    expect(run.out).toBe("Signed in as ada@example.com\n");
    expect(context.server.routes()).toEqual(["GET /api/auth/me"]);
    expect(await context.tokens()).toEqual({ [context.server.url]: "token" });
  });

  test("login with a bad token", async () => {
    const context = setup();

    const err = await context.fail(["login", "--token", "revoked"]);

    expect(err).toBe(
      `error: ${context.server.url} doesn't accept that token.\n`
    );
    expect(await Bun.file(context.configPath).exists()).toBe(false);
  });

  test("tokens belong to their server", async () => {
    const context = setup();
    context.saveTokens({ "https://other.example.com": "token" });

    expect(await context.fail(["whoami"])).toBe(
      "error: You're not signed in. Run redoost login.\n"
    );
  });

  test("token from the environment", async () => {
    const context = setup();
    context.saveTokens({ [context.server.url]: "stale" });

    const run = await context.run(["whoami"], { REDOOST_TOKEN: "token" });

    expect(run.out).toStartWith("ada@example.com\n");
    expect(context.server.state.requests[0]?.authorization).toBe(
      "Bearer token"
    );
  });

  test("rejected environment token", async () => {
    const context = setup();

    const run = await context.run(["whoami"], { REDOOST_TOKEN: "revoked" });

    expect(run.code).toBe(1);
    expect(run.err).toStartWith("error: REDOOST_TOKEN isn't a valid token");
  });

  test("whoami shows storage use", async () => {
    const context = setup();
    context.signIn();

    expect(await output(context.run(["whoami"]))).toBe(
      "ada@example.com\n3.4 MiB of 1 GiB used\n"
    );
    expect(JSON.parse(await output(context.run(["whoami", "--json"])))).toEqual(
      {
        ...user(),
        usage: context.server.state.usage,
      }
    );
  });

  test("whoami on servers without usage", async () => {
    const context = setup();
    context.signIn();
    context.server.state.usage = null;

    expect(await output(context.run(["whoami"]))).toBe("ada@example.com\n");
  });

  test("logout forgets the token", async () => {
    const context = setup();
    context.signIn();

    await context.run(["logout"]);

    expect(await context.tokens()).toEqual({});
    expect(statSync(context.configPath).mode % 0o1000).toBe(0o600);
    expect(context.server.routes()).toEqual([
      "DELETE /api/auth/tokens/current",
    ]);
    expect(context.server.state.requests[0]?.authorization).toBe(
      "Bearer token"
    );
  });

  test("logout while signed out", async () => {
    const context = setup();

    const run = await context.run(["logout"]);

    expect(run.out).toBe("Signed out\n");
    expect(context.server.routes()).toEqual([]);
  });

  test("unreadable config reads as signed out", async () => {
    const context = setup();
    context.saveTokens({});
    writeFileSync(context.configPath, '{"tokens": ');
    context.server.state.pendingPolls = 0;

    expect(await context.fail(["whoami"])).toBe(
      "error: You're not signed in. Run redoost login.\n"
    );
    await context.run(["login"]);
    expect(await context.tokens()).toEqual({ [context.server.url]: "token" });
    expect(readdirSync(path.dirname(context.configPath))).toEqual([
      "config.json",
    ]);
  });

  test("expired sign-ins need a new login", async () => {
    const context = setup();
    context.saveTokens({ [context.server.url]: "expired" });

    expect(await context.fail(["whoami"])).toContain("Run redoost login");
  });
});

describe("publishing", () => {
  test("publish never sends the token to S3", async () => {
    const context = siteWith({
      "index.html": "<h1>hello</h1>",
      "logo.png": "png",
    });

    const run = await context.run(["publish", context.site, "--json"]);

    const uploads = context.server.state.requests.filter(
      (request) => request.path === "/s3/sites"
    );

    expect(uploads.map((request) => request.authorization)).toEqual([
      null,
      null,
    ]);
    expect(JSON.parse(run.out).url).toBe("https://brave-otter-1a2b.sites.test");
  });

  test("publish prints progress once outside a terminal", async () => {
    const context = siteWith({ "index.html": "<h1>hello</h1>" });

    const run = await context.run(["publish", context.site]);

    expect(run.out).toBe("Published https://brave-otter-1a2b.sites.test\n");
    expect(run.err).toBe("Preparing files…\nUploading 1 file…\n");
  });

  test("publish with a description and a message", async () => {
    const context = siteWith({ "index.html": "<h1>hello</h1>" });
    const page = path.join(context.site, "index.html");

    await context.run([
      "publish",
      page,
      "-d",
      "Portfolio draft",
      "-m",
      "New header",
    ]);

    const sent = [
      ...context.server.sent("POST /api/deployments"),
      ...context.server.sent("POST /api/deployments/brave-otter-1a2b/complete"),
    ];

    expect(
      sent.map((body) => [body.description, body.version_description])
    ).toEqual([
      ["Portfolio draft", "New header"],
      ["Portfolio draft", "New header"],
    ]);
  });

  test("updates keep the description without one", async () => {
    const context = siteWith({ "index.html": "<h1>new</h1>" });

    await context.run(["publish", context.site, "-u", "brave-otter-1a2b"]);

    const [completed] = context.server.sent(
      "POST /api/deployments/brave-otter-1a2b/complete"
    );

    expect(completed).not.toHaveProperty("description");
  });

  test("unchanged updates still change the description", async () => {
    const context = siteWith({ "index.html": "<h1>same</h1>" });
    context.server.state.stored = await storedSite(context.site);

    const run = await context.run([
      "publish",
      context.site,
      "-u",
      "brave-otter-1a2b",
      "-d",
      "Final",
    ]);

    expect(run.out).toBe(
      "No changes to publish, but updated the description\n"
    );
    expect(
      context.server.sent("PATCH /api/deployments/brave-otter-1a2b")
    ).toEqual([{ description: "Final" }]);
    expect(context.server.routes()).not.toContain(
      "PUT /api/deployments/brave-otter-1a2b"
    );
  });

  test("publish with an expiry", async () => {
    const context = siteWith({ "index.html": "<h1>hi</h1>" });

    await context.run([
      "publish",
      context.site,
      "--expires",
      "2099-12-31T18:00",
    ]);
    const [manifest] = context.server.sent("POST /api/deployments");
    expect(manifest.expires_at).toStartWith("2099-12-31T18:00:00");

    context.server.state.stored = await storedSite(context.site);

    const run = await context.run([
      "publish",
      context.site,
      "-u",
      "brave-otter-1a2b",
      "--expires",
      "2099-12-31",
    ]);

    expect(run.out).toBe("No changes to publish, but updated the expiry\n");

    const [patch] = context.server.sent(
      "PATCH /api/deployments/brave-otter-1a2b"
    );

    expect(patch.expires_at).toStartWith("2100-01-01T00:00:00");
  });

  test.each([204, 503])(
    "failed updates free the site, even when freeing it answers %d",
    async (cancelStatus) => {
      const context = siteWith({ "index.html": "<h1>new</h1>" });
      context.server.state.uploadStatus = 403;
      context.server.state.cancelStatus = cancelStatus;

      const err = await context.fail([
        "publish",
        path.join(context.site, "index.html"),
        "--update",
        "brave-otter-1a2b",
      ]);

      expect(err).toEndWith("error: Upload failed (403) for index.html.\n");
      expect(context.server.routes()).toContain(
        "POST /api/deployments/brave-otter-1a2b/cancel"
      );
    }
  );

  test("uploads retry server errors", async () => {
    const context = siteWith({ "index.html": "<h1>new</h1>" });
    context.server.state.uploadStatus = 503;

    const err = await context.fail(["publish", context.site]);

    expect(err).toEndWith("error: Upload failed (503) for index.html.\n");

    const uploads = context.server
      .routes()
      .filter((route) => route === "POST /s3/sites");

    expect(uploads).toHaveLength(3);
  });

  test.each([
    [
      "max_file_size",
      2048,
      "photo.png is 3 KiB uncompressed (and 1 more); files can be up to 2 KiB.",
    ],
    [
      "max_deployment_files",
      2,
      "The site has 3 files; sites can have up to 2.",
    ],
    [
      "max_deployment_size",
      4096,
      "The site is 6 KiB uncompressed; sites can be up to 4 KiB.",
    ],
  ] as const)(
    "publish checks %s before uploading",
    async (limit, value, error) => {
      const context = siteWith({
        "index.html": "<h1>hello</h1>",
        "photo.png": "p".repeat(3000),
        "video.webm": "v".repeat(2500),
      });

      context.server.state.limits[limit] = value;

      const err = await context.fail(["publish", context.site]);

      expect(err).toEndWith(`error: ${error}\n`);
      expect(context.server.routes()).not.toContain("POST /api/deployments");
    }
  );

  test("unchanged updates publish nothing", async () => {
    const context = siteWith({ "index.html": "<h1>same</h1>" });
    context.server.state.stored = await storedSite(context.site);

    const run = await context.run([
      "publish",
      context.site,
      "--update",
      "brave-otter-1a2b",
    ]);

    expect(run.out).toBe("No changes to publish\n");
    expect(context.server.routes()).not.toContain(
      "PUT /api/deployments/brave-otter-1a2b"
    );
  });

  test("files another client compressed are unchanged", async () => {
    const context = siteWith({ "index.html": "<h1>same</h1>".repeat(20) });
    const files = await prepareFiles(await readSite(context.site));
    expect(files.some((file) => file.gzip)).toBe(true);
    context.server.state.stored = files.map((file) => ({
      path: file.path,
      sha256: "x",
      original_sha256: file.originalSha256,
    }));
    const update = ["publish", context.site, "--update", "brave-otter-1a2b"];

    expect(await output(context.run(update))).toBe("No changes to publish\n");

    writeFileSync(
      path.join(context.site, "index.html"),
      "<h1>changed</h1>".repeat(20)
    );
    expect(await output(context.run(update))).toBe(
      "Published https://brave-otter-1a2b.sites.test\n"
    );
  });

  test("removed files are a change", async () => {
    const context = siteWith({ "index.html": "<h1>same</h1>" });
    context.server.state.stored = [
      ...(await storedSite(context.site)),
      { path: "old.html", sha256: "x" },
    ];

    const run = await context.run([
      "publish",
      context.site,
      "-u",
      "brave-otter-1a2b",
    ]);

    expect(run.out).toBe("Published https://brave-otter-1a2b.sites.test\n");
    expect(context.server.routes()).toContain(
      "PUT /api/deployments/brave-otter-1a2b"
    );
  });
});

describe("managing sites", () => {
  test("list", async () => {
    const context = setup();
    context.signIn();

    expect(await output(context.run(["list"]))).toBe(
      "https://brave-otter-1a2b.sites.test  2 files  3.4 MiB  2026-10-09  Portfolio draft\n" +
        "https://quiet-heron-7f3c.sites.test  1 file  900 B  2026-10-09  offline  expires 2099-01-01\n"
    );
  });

  test("site lines", () => {
    const site = {
      url: null,
      slug: "brave-otter-1a2b",
      state: "ready",
      file_count: 1,
      total_size: 900,
      storage_size: 2048,
      version_count: 3,
      enabled: true,
      description: "",
      created_at: "2026-10-09T10:00:00Z",
      expires_at: "2000-01-01T00:00:00Z",
      locked_until: "",
    } as const;

    expect(siteLine(site)).toBe(
      "brave-otter-1a2b  1 file  900 B  2026-10-09  3 versions, 2 KiB  expired"
    );
  });

  test("versions", async () => {
    const context = setup();
    context.signIn();

    expect(await output(context.run(["versions", "brave-otter-1a2b"]))).toBe(
      "v-0123456789ab  2026-10-10 09:30  2 files  3.4 MiB  current  New header\n" +
        "v-fedcba987654  2026-10-09 10:00  1 file  900 B\n"
    );
  });

  test("rollback", async () => {
    const context = setup();
    context.signIn();

    expect(await output(context.run(["rollback", "brave-otter-1a2b"]))).toBe(
      "https://brave-otter-1a2b.sites.test now serves v-fedcba987654\n"
    );
    expect(
      await output(
        context.run(["rollback", "brave-otter-1a2b", "v-0123456789ab"])
      )
    ).toBe("https://brave-otter-1a2b.sites.test now serves v-0123456789ab\n");
    expect(
      context.server.routes().filter((route) => route.includes("restore"))
    ).toEqual([
      "POST /api/deployments/brave-otter-1a2b/versions/v-fedcba987654/restore",
      "POST /api/deployments/brave-otter-1a2b/versions/v-0123456789ab/restore",
    ]);
  });

  test("rollback needs an earlier version", async () => {
    const context = setup();
    context.signIn();
    context.server.state.versions.splice(1);

    expect(await context.fail(["rollback", "brave-otter-1a2b"])).toBe(
      "error: brave-otter-1a2b has no other version to go back to.\n"
    );
    expect(
      await context.fail(["rollback", "brave-otter-1a2b", "v-000000000000"])
    ).toBe("error: Version not found\n");
  });

  test("prune", async () => {
    const context = setup();
    context.signIn();

    expect(await output(context.run(["prune", "brave-otter-1a2b"]))).toBe(
      "Kept only the version brave-otter-1a2b serves, 3.4 MiB\n"
    );
    expect(context.server.routes()).toEqual([
      "DELETE /api/deployments/brave-otter-1a2b/versions",
    ]);
  });

  test("expire", async () => {
    const context = setup();
    context.signIn();

    expect(
      await output(context.run(["expire", "brave-otter-1a2b", "2099-12-31"]))
    ).toBe("brave-otter-1a2b goes offline at 2100-01-01 00:00\n");
    expect(
      await output(
        context.run(["expire", "brave-otter-1a2b", "2099-12-31T18:30"])
      )
    ).toBe("brave-otter-1a2b goes offline at 2099-12-31 18:30\n");
    expect(
      await output(context.run(["expire", "brave-otter-1a2b", "never"]))
    ).toBe("brave-otter-1a2b no longer expires\n");

    const [first, second, third] = context.server
      .sent("PATCH /api/deployments/brave-otter-1a2b")
      .map((change) => change.expires_at);

    expect(first).toStartWith("2100-01-01T00:00:00");
    expect(second).toStartWith("2099-12-31T18:30:00");
    expect(third).toBeNull();

    const run = await context.run(["expire", "brave-otter-1a2b", "next week"]);
    expect(run.code).toBe(2);
    expect(run.err).toContain("expected a date like 2026-12-31");
  });

  test("describe", async () => {
    const context = setup();
    context.signIn();

    expect(
      await output(
        context.run(["describe", "brave-otter-1a2b", "Portfolio, final"])
      )
    ).toBe("Described brave-otter-1a2b\n");
    expect(
      await output(context.run(["describe", "brave-otter-1a2b", ""]))
    ).toBe("Cleared brave-otter-1a2b's description\n");
    expect(
      context.server.sent("PATCH /api/deployments/brave-otter-1a2b")
    ).toEqual([{ description: "Portfolio, final" }, { description: "" }]);
  });

  test("delete several sites", async () => {
    const context = setup();
    context.signIn();

    const slugs = Array.from(
      { length: 150 },
      (_, index) => `site-${index.toString(16).padStart(4, "0")}`
    ).toReversed();

    const run = await context.run(["delete", ...slugs, slugs.at(-1) ?? ""]);

    expect(run.out).toBe(`Deleted ${slugs.join(", ")}\n`);
    expect(
      context.server.state.requests.map((request) => request.slugs)
    ).toEqual([slugs.slice(0, 100), slugs.slice(100)]);
  });

  test("delete reports sites not found", async () => {
    const context = setup();
    context.signIn();

    const run = await context.run([
      "delete",
      "brave-otter-1a2b",
      "missing-site",
      "--json",
    ]);

    expect(run.code).toBe(1);
    expect(run.err).toBe("error: Not found: missing-site\n");
    expect(JSON.parse(run.out)).toEqual({
      deleted: ["brave-otter-1a2b"],
      missing: ["missing-site"],
    });
  });

  test("disable and enable", async () => {
    const context = setup();
    context.signIn();

    expect(await output(context.run(["disable", "brave-otter-1a2b"]))).toBe(
      "brave-otter-1a2b is offline; visitors may still see it for a minute\n"
    );
    expect(
      JSON.parse(
        await output(context.run(["enable", "brave-otter-1a2b", "--json"]))
      )
    ).toEqual({
      changed: ["brave-otter-1a2b"],
      missing: [],
    });

    const patches = context.server.state.requests.filter(
      (request) => request.method === "PATCH"
    );

    expect(patches.map((request) => JSON.parse(request.body))).toEqual([
      { enabled: false },
      { enabled: true },
    ]);
    expect(patches[0]?.slugs).toEqual(["brave-otter-1a2b"]);
  });

  test("disable several sites", async () => {
    const context = setup();
    context.signIn();

    const run = await context.run([
      "disable",
      "quiet-heron-7f3c",
      "brave-otter-1a2b",
      "missing-site",
    ]);

    expect(run.code).toBe(1);
    expect(run.err).toBe("error: Not found: missing-site\n");
    expect(run.out).toBe(
      "quiet-heron-7f3c, brave-otter-1a2b are offline; visitors may still see them for a minute\n"
    );
  });
});

describe("the command line", () => {
  test.each(["--version", "-v"])("%s", async (flag) => {
    expect(await output(setup().run([flag]))).toBe(`redoost ${version}\n`);
  });

  test("help", async () => {
    const run = await setup().run(["--help"]);

    expect(run.out).toContain("Usage: redoost <command> [options]");
    expect(run.code).toBe(0);
  });

  test.each([
    [],
    ["frob"],
    ["list", "--token", "x"],
    ["versions"],
    ["list", "extra"],
  ])("usage mistakes: %p", async (...args) => {
    const run = await setup().run(args);

    expect(run.code).toBe(2);
    expect(run.err).toStartWith("error: ");
  });
});
