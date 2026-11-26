import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { version } from "../package.json";
import { configPath } from "./config";

/** Seconds between checks for a newer release, so commands rarely wait on the network. */
export const checkEvery = 24 * 60 * 60;

const releasePattern = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/u;

/** The release a version belongs to; builds between releases look like 0.6.1-3-g1a2b3c4. */
export const release = (text: string) => {
  const groups = releasePattern.exec(text)?.groups;

  return groups
    ? {
        major: Number(groups.major),
        minor: Number(groups.minor),
        patch: Number(groups.patch),
      }
    : null;
};

const reportsVersion = (body: unknown): body is { version: string } =>
  body instanceof Object &&
  "version" in body &&
  typeof body.version === "string";

/** The version the server's /api/version reports, or null if it can't be read. */
export const serverVersion = async (server: string) => {
  try {
    const response = await fetch(`${server}/api/version`, {
      signal: AbortSignal.timeout(1000),
    });

    const body = response.ok ? await response.json() : null;

    return reportsVersion(body) ? body.version : null;
  } catch {
    return null;
  }
};

const now = () => Date.now() / 1000;

const isFresh = (
  entry: unknown
): entry is { checked: number; version: string | null } =>
  entry instanceof Object &&
  "checked" in entry &&
  "version" in entry &&
  typeof entry.checked === "number" &&
  (entry.version === null || typeof entry.version === "string") &&
  now() - entry.checked < checkEvery;

/** The server's version, asking it at most daily and remembering the answer in cache. */
export const cachedServerVersion = async (server: string, cache: string) => {
  const checked = await readFile(cache, "utf-8")
    .then(JSON.parse)
    .catch(() => null);

  const entry = checked?.[server];

  if (isFresh(entry)) {
    return entry.version;
  }

  const found = await serverVersion(server);

  const remembered = {
    ...checked,
    [server]: { checked: now(), version: found },
  };

  await mkdir(path.dirname(cache), { recursive: true })
    .then(() => writeFile(cache, JSON.stringify(remembered)))
    .catch(() => null);

  return found;
};

/** The server's release, if it's newer than this CLI. */
export const newerRelease = (available: string | null) => {
  const theirs = available ? release(available) : null;
  const ours = release(version);

  if (!theirs || !ours) {
    return null;
  }

  const order =
    theirs.major - ours.major ||
    theirs.minor - ours.minor ||
    theirs.patch - ours.patch;

  return order > 0 ? `${theirs.major}.${theirs.minor}.${theirs.patch}` : null;
};

export const notify = async (server: string) => {
  const cache = path.join(path.dirname(configPath()), "updates.json");
  const newer = newerRelease(await cachedServerVersion(server, cache));

  if (newer) {
    process.stderr.write(
      `A newer redoost CLI is available (${newer}, you have ${version}). Run redoost update.\n`
    );
  }
};

export type Manager = "npm" | "bun";

/** Where each package manager keeps global packages, as real paths. */
export type Roots = Record<Manager, string | null>;

/** The package manager whose global packages hold script, so update reinstalls it the same way. */
export const installedWith = (script: string, roots: Roots) =>
  (["npm", "bun"] satisfies Manager[]).find((manager) => {
    const root = roots[manager];

    return root !== null && script.startsWith(root + path.sep);
  }) ?? null;

const realpath = (file: string) => {
  try {
    return realpathSync(file);
  } catch {
    return null;
  }
};

export const globalRoots = () => {
  const npm = spawnSync("npm", ["root", "-g"], {
    encoding: "utf-8",
    shell: process.platform === "win32",
  });

  const bun = process.env.BUN_INSTALL || path.join(homedir(), ".bun");

  return {
    npm: npm.status === 0 ? realpath(npm.stdout.trim()) : null,
    bun: realpath(path.join(bun, "install", "global", "node_modules")),
  };
};

export const installCommands = (next: string) => ({
  npm: ["npm", "install", "-g", `redoost@${next}`],
  bun: ["bun", "add", "-g", `redoost@${next}`],
});

export const runningScript = () => realpath(process.argv[1] ?? "") ?? "";
