import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { defaultLimits, prepareFiles } from "@redoost/shared";

import { readSite } from "./files";

const cli = path.join(import.meta.dir, "..");

/** The bundle that gets published, built fresh for the tests. */
export const bin = path.join(cli, "dist", "redoost.js");

/** What runs the CLI under test: Bun, unless REDOOST_TEST_RUNTIME names another, like node. */
export const runtime = process.env.REDOOST_TEST_RUNTIME ?? process.execPath;

const build = Bun.spawnSync([process.execPath, "run", "build"], { cwd: cli });

if (build.exitCode !== 0) {
  throw new Error(`The CLI didn't build:\n${build.stderr.toString()}`);
}

const scratch = mkdtempSync(path.join(tmpdir(), "redoost-tests-"));

process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

/** A new empty folder, removed once the tests end. */
export const folder = () => mkdtempSync(path.join(scratch, "case-"));

export const user = () => ({
  id: "u1",
  provider: "google",
  email: "ada@example.com",
  name: "Ada",
});

/** A request the fake server received. */
export interface Recorded {
  method: string;
  path: string;
  route: string;
  slugs: string[];
  authorization: string | null;
  body: string;
}

const reply = <T>(status: number, body?: T) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ready = { slug: "brave-otter-1a2b", state: "ready" };

const sites = [
  {
    slug: "brave-otter-1a2b",
    file_count: 2,
    total_size: 3_565_158,
    description: "Portfolio draft",
    created_at: "2026-10-09T10:00:00Z",
  },
  {
    slug: "quiet-heron-7f3c",
    file_count: 1,
    total_size: 900,
    description: "",
    created_at: "2026-10-09T10:00:00Z",
    enabled: false,
    expires_at: "2099-01-01T00:00:00Z",
  },
];

const versions = () => [
  {
    id: "v-0123456789ab",
    created_at: "2026-10-10T09:30:00Z",
    file_count: 2,
    size: 3_565_158,
    description: "New header",
    current: true,
  },
  {
    id: "v-fedcba987654",
    created_at: "2026-10-09T10:00:00Z",
    file_count: 1,
    size: 900,
    description: "",
    current: false,
  },
];

interface State {
  requests: Recorded[];
  pendingPolls: number;
  uploadStatus: number;
  cancelStatus: number;
  stored: object[];
  limits: typeof defaultLimits;
  usage: { used: number; limit: number } | null;
  versions: ReturnType<typeof versions>;
  release: { version: string } | null;
}

const initialState = () => {
  const state: State = {
    requests: [],
    pendingPolls: 1,
    uploadStatus: 204,
    cancelStatus: 204,
    stored: [],
    limits: { ...defaultLimits },
    usage: { used: 3_565_158, limit: 1024 ** 3 },
    versions: versions(),
    release: null,
  };

  return state;
};

const bulkChange = (request: Recorded) => {
  const found = request.slugs
    .filter((slug) => !slug.startsWith("missing"))
    .toSorted();

  const field = request.method === "DELETE" ? "deleted" : "changed";

  return reply(200, { [field]: found });
};

const deployment = (request: Recorded, uploadUrl: string) => {
  const manifest: { files: { path: string }[] } = JSON.parse(request.body);

  const uploads = manifest.files.map((file) => ({
    path: file.path,
    fields: { key: file.path },
  }));

  return reply(200, {
    slug: "brave-otter-1a2b",
    upload_url: uploadUrl,
    uploads,
  });
};

const signedInRoutes = (state: State) =>
  new Map<string, (request: Recorded, uploadUrl: string) => Response>([
    ["GET /api/auth/me", () => reply(200, user())],
    [
      "GET /api/deployments/usage",
      () =>
        state.usage
          ? reply(200, state.usage)
          : reply(404, { detail: "Not Found" }),
    ],
    ["GET /api/deployments/limits", () => reply(200, state.limits)],
    [
      "GET /config.json",
      () => reply(200, { sitesOrigin: "https://sites.test" }),
    ],
    ["POST /api/deployments", deployment],
    ["PUT /api/deployments/brave-otter-1a2b", deployment],
    [
      "GET /api/deployments/brave-otter-1a2b/files",
      () => reply(200, state.stored),
    ],
    ["GET /api/deployments/brave-otter-1a2b", () => reply(200, ready)],
    ["GET /api/deployments", () => reply(200, sites)],
    [
      "GET /api/deployments/brave-otter-1a2b/versions",
      () => reply(200, state.versions),
    ],
    [
      "DELETE /api/deployments/brave-otter-1a2b/versions",
      () => reply(200, { slug: "brave-otter-1a2b", storage_size: 3_565_158 }),
    ],
    [
      "PATCH /api/deployments/brave-otter-1a2b",
      (request) =>
        reply(200, { ...JSON.parse(request.body), slug: "brave-otter-1a2b" }),
    ],
    ["DELETE /api/deployments", bulkChange],
    ["PATCH /api/deployments", bulkChange],
    [
      "POST /api/deployments/brave-otter-1a2b/cancel",
      () => reply(state.cancelStatus),
    ],
    [
      "POST /api/deployments/brave-otter-1a2b/complete",
      () => reply(200, ready),
    ],
  ]);

const restore = (state: State, request: Recorded) => {
  const version = request.path.split("/").at(-2);

  return state.versions.some(({ id }) => id === version)
    ? reply(200, ready)
    : reply(404, { detail: "Version not found" });
};

const claim = (state: State) => {
  if (state.pendingPolls > 0) {
    state.pendingPolls -= 1;

    return reply(202);
  }

  return reply(200, { token: "token", user: user() });
};

const handle = (state: State, request: Recorded, uploadUrl: string) => {
  if (request.path === "/s3/sites") {
    return reply(state.uploadStatus);
  }

  if (request.route === "GET /api/version" && state.release) {
    return reply(200, state.release);
  }

  if (request.route === "POST /api/auth/cli") {
    return reply(201, { id: "link", secret: "secret" });
  }

  if (request.route === "POST /api/auth/cli/link/token") {
    return claim(state);
  }

  if (request.authorization !== "Bearer token") {
    return reply(401, { detail: "Invalid token" });
  }

  if (
    /^POST \/api\/deployments\/brave-otter-1a2b\/versions\/.+\/restore$/u.test(
      request.route
    )
  ) {
    return restore(state, request);
  }

  return (
    signedInRoutes(state).get(request.route)?.(request, uploadUrl) ?? reply(204)
  );
};

/** The redoost API and S3 in one, recording what the CLI sends; tests change its state to stage what they need. */
export const fakeServer = () => {
  const state = initialState();

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (incoming) => {
      const url = new URL(incoming.url);

      const request = {
        method: incoming.method,
        path: url.pathname,
        route: `${incoming.method} ${url.pathname}`,
        slugs: url.searchParams.getAll("slug"),
        authorization: incoming.headers.get("Authorization"),
        body: await incoming.text(),
      };

      const response = handle(state, request, `${url.origin}/s3/sites`);
      state.requests.push(request);

      return response;
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    state,
    routes: () => state.requests.map(({ route }) => route),
    sent: (route: string) =>
      state.requests
        .filter((request) => request.route === route)
        .map(({ body }) => JSON.parse(body)),
  };
};

/** The fake server and a config folder of its own, to run the CLI against. */
export const setup = () => {
  const server = fakeServer();
  const home = folder();
  const configPath = path.join(home, "redoost", "config.json");

  const spawn = (args: string[], env: Record<string, string> = {}) => {
    const {
      REDOOST_TOKEN: _token,
      REDOOST_SERVER: _server,
      ...inherited
    } = process.env;

    return Bun.spawn([runtime, bin, ...args, "--server", server.url], {
      env: { ...inherited, XDG_CONFIG_HOME: home, ...env },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  };

  const run = async (args: string[], env?: Record<string, string>) => {
    const child = spawn(args, env);

    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return { code, out, err };
  };

  const saveTokens = (tokens: Record<string, string>) => {
    mkdirSync(path.dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({ tokens }));
  };

  const tokens = async () => {
    const config = await Bun.file(configPath).json();

    return config.tokens;
  };

  const fail = async (args: string[], env?: Record<string, string>) => {
    const result = await run(args, env);

    if (result.code !== 1) {
      throw new Error(`Expected exit 1, got ${result.code}: ${result.err}`);
    }

    return result.err;
  };

  return {
    server,
    home,
    configPath,
    spawn,
    run,
    fail,
    saveTokens,
    signIn: () => saveTokens({ [server.url]: "token" }),
    tokens,
  };
};

export const writeFiles = (root: string, files: Record<string, string>) => {
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
};

/** What the server stores for a site already published from this folder. */
export const storedSite = async (site: string) => {
  const files = await prepareFiles(await readSite(site));

  return files.map((file) => ({ path: file.path, sha256: file.sha256 }));
};
