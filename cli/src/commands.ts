import { spawnSync } from "node:child_process";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

import {
  checkLimits,
  createApi,
  fileManifest,
  formatBytes,
  prepareFiles,
  siteChanges,
  siteUrl,
  slugsPerRequest,
  uploadFiles,
} from "@redoost/shared";
import type {
  Api,
  CliLogin,
  Deployment,
  DeploymentChange,
  SignedIn,
  SiteManifest,
  UploadFile,
  Version,
} from "@redoost/shared";

import { version as cliVersion } from "../package.json";
import { loadTokens, saveTokens } from "./config";
import { readSite } from "./files";
import { networkAddress, openBrowser, openOnEnter, serve } from "./preview";
import { spinning } from "./spinner";
import {
  globalRoots,
  installCommands,
  installedWith,
  newerRelease,
  release,
  runningScript,
  serverVersion,
} from "./updates";

export const signedOut = "You're not signed in. Run redoost login.";

/** The server to use and whether to print JSON, given to every command. */
export interface Options {
  server: string;
  json: boolean;
}

/** The error shown when the server rejects the token in use. */
export const rejected = { message: signedOut };

/** What to undo if Ctrl+C stops the CLI, like freeing a site an update locked. */
export const undoOnInterrupt = new Set<() => Promise<void>>();

const output = <T>(options: Options, data: T, text: string) => {
  console.log(options.json ? JSON.stringify(data) : text);
};

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const signedIn = ({ server }: Options) => {
  const fromEnvironment = process.env.REDOOST_TOKEN;

  if (fromEnvironment) {
    rejected.message = `REDOOST_TOKEN isn't a valid token for ${server}.`;

    return createApi({ server, token: fromEnvironment });
  }

  const token = loadTokens().get(server);

  if (!token) {
    throw new Error(signedOut);
  }

  return createApi({ server, token });
};

const sitesOrigin = (api: Api) =>
  api
    .dashboardConfig()
    .then((config) => config.sitesOrigin)
    .catch(() => null);

const saveToken = (server: string, token: string) => {
  saveTokens(loadTokens().set(server, token));
};

const openOnFirstEnter = (url: string) => {
  process.stdin.once("data", async () => {
    if (process.stderr.isTTY) {
      process.stderr.write("\r\u001B[K\u001B[1A");
    }

    if (!(await openBrowser(url))) {
      process.stderr.write(
        `\rCouldn't open a browser. Open ${url} yourself.\n`
      );
    }
  });
};

const claimWhenApproved: (
  api: Api,
  started: CliLogin,
  name: string
) => Promise<SignedIn> = async (api, started, name) => {
  const claimed = await api.claimCliLogin(started.id, {
    secret: started.secret,
    name,
  });

  if (claimed) {
    return claimed;
  }

  await sleep(2000);

  return claimWhenApproved(api, started, name);
};

/**
 * Signs in through a link opened on any device, polling until it's approved;
 * the server answers 202 until then, and 404 once the link expires. A token,
 * as pipelines use, signs in without a link.
 */
export const login = async (options: Options, token?: string) => {
  const { server } = options;

  if (token !== undefined) {
    rejected.message = `${server} doesn't accept that token.`;
    const user = await createApi({ server, token }).me();
    saveToken(server, token);
    output(options, user, `Signed in as ${user.email}`);

    return;
  }

  const api = createApi({ server });
  const started = await api.startCliLogin();
  const link = `${server}/cli/${started.id}`;
  process.stderr.write(`Open this link on any device to sign in:\n${link}\n`);

  if (!options.json && process.stdin.isTTY) {
    process.stderr.write("Press Enter to open it in your browser.\n");
    openOnFirstEnter(link);
  }

  const name = [...`CLI on ${hostname()}`].slice(0, 100).join("");

  const signed = await spinning(
    "Waiting for you to continue in the browser",
    options.json,
    () => claimWhenApproved(api, started, name)
  );

  saveToken(server, signed.token);
  output(options, signed.user, `Signed in as ${signed.user.email}`);
};

/** Forgets the sign-in, revoking it on the server too so the token is dead rather than just forgotten. */
export const logout = async (options: Options) => {
  const tokens = loadTokens();
  const token = tokens.get(options.server);

  if (token) {
    tokens.delete(options.server);
    await createApi({ server: options.server, token })
      .revokeCurrentToken()
      .catch(() => null);
  }

  saveTokens(tokens);
  output(options, {}, "Signed out");
};

/** Shows who's signed in, and their storage use on servers from 0.3.1, which report it. */
export const whoami = async (options: Options) => {
  const api = signedIn(options);
  const user = await api.me();
  const usage = await api.readUsage().catch(() => null);

  if (!usage || Object.keys(usage).length === 0) {
    output(options, user, user.email ?? "");

    return;
  }

  const used = `${formatBytes(usage.used)} of ${formatBytes(usage.limit)} used`;
  output(options, { ...user, usage }, `${user.email}\n${used}`);
};

const prepare = async (api: Api, site: string, quiet: boolean) => {
  const { limits, files } = await spinning(
    "Preparing files",
    quiet,
    async () => {
      const found = await api.readLimits();
      const read = await readSite(site, found);

      return { limits: found, files: await prepareFiles(read) };
    }
  );

  checkLimits(files, limits);

  return files;
};

const unchanged = async (api: Api, slug: string, files: UploadFile[]) => {
  const stored = await api.readFiles(slug);
  const { changes, removed } = siteChanges(files, files, stored);

  return changes.size === 0 && removed.length === 0;
};

const publishNothing = async (
  options: Options,
  api: Api,
  slug: string,
  manifest: SiteManifest
) => {
  const url = siteUrl(await sitesOrigin(api), slug);
  const change: DeploymentChange = {};
  const updated: string[] = [];

  if (manifest.description !== undefined) {
    change.description = manifest.description;
    updated.push("description");
  }

  if (manifest.expires_at !== undefined) {
    change.expires_at = manifest.expires_at;
    updated.push("expiry");
  }

  if (updated.length === 0) {
    const site = await api.readDeployment(slug);
    output(options, { ...site, url }, "No changes to publish");

    return;
  }

  const site = await api.changeDeployment(slug, change);
  const text = `No changes to publish, but updated the ${updated.join(" and ")}`;
  output(options, { ...site, url }, text);
};

export interface PublishFlags {
  update?: string;
  description?: string;
  message?: string;
  expires?: string;
}

const upload = async (
  api: Api,
  files: UploadFile[],
  manifest: SiteManifest,
  deployment: Awaited<ReturnType<Api["createDeployment"]>>,
  update: (text: string) => void
) => {
  const total = plural(deployment.uploads.length, "file");
  let done = 0;
  await uploadFiles(deployment, files, {
    onProgress: (_path, _bytes, complete) => {
      if (complete) {
        done += 1;
        update(`Uploading ${done} of ${total}`);
      }
    },
  });
  update("Publishing");

  return api.completeDeployment(deployment.slug, manifest);
};

const uploadUndoably = async <T>(
  uploading: Promise<T>,
  cancel: (() => Promise<void>) | null
) => {
  if (cancel) {
    undoOnInterrupt.add(cancel);
  }

  try {
    return await uploading;
  } catch (error) {
    undoOnInterrupt.clear();
    await cancel?.().catch(() => null);

    throw error;
  } finally {
    undoOnInterrupt.clear();
  }
};

/**
 * Publishes a site, or with update, replaces a site's files, uploading only
 * what changed; an update without changes only changes what the flags ask for.
 * Left out, an update keeps the site's description. An update that fails or is
 * interrupted is cancelled, since it keeps the site locked until then.
 */
export const publish = async (
  options: Options,
  site: string,
  flags: PublishFlags
) => {
  const api = signedIn(options);
  const files = await prepare(api, site, options.json);

  const manifest: SiteManifest = {
    files: fileManifest(files),
    ...(flags.description !== undefined && { description: flags.description }),
    ...(flags.message !== undefined && { version_description: flags.message }),
    ...(flags.expires !== undefined && { expires_at: flags.expires }),
  };

  if (flags.update && (await unchanged(api, flags.update, files))) {
    await publishNothing(options, api, flags.update, manifest);

    return;
  }

  const deployment = flags.update
    ? await api.updateDeployment(flags.update, manifest)
    : await api.createDeployment(manifest);

  const count = deployment.uploads.length;
  const text = count > 0 ? `Uploading ${plural(count, "file")}` : "Publishing";
  const cancel = () => api.cancelUpload(deployment.slug);

  const published = await uploadUndoably(
    spinning(text, options.json, (update) =>
      upload(api, files, manifest, deployment, update)
    ),
    flags.update ? cancel : null
  );

  const url = siteUrl(await sitesOrigin(api), deployment.slug);
  output(options, { ...published, url }, `Published ${url ?? deployment.slug}`);
};

/**
 * Serves a site locally as it would be published, until Ctrl+C, even after
 * input ends. Only people at a terminal can press Enter to open it; scripts
 * and agents just get the URL.
 */
export const preview = async (
  options: Options,
  site: string,
  host: string,
  port: number
) => {
  const files = await readSite(site);

  const server = await serve(files, host, port).catch((error: Error) => {
    throw new Error(`Couldn't listen on ${host}:${port}: ${error.message}`);
  });

  // SAFETY: a server listening on a host and port has an IP address
  const { port: bound } = server.address() as AddressInfo;
  const everywhere = host === "0.0.0.0";
  const url = `http://${everywhere ? "127.0.0.1" : host}:${bound}`;
  const network = everywhere ? await networkAddress() : null;
  const networkUrl = network ? `http://${network}:${bound}` : null;
  const interactive = !options.json && process.stdin.isTTY;
  const shared = networkUrl ? `, and on your network at ${networkUrl}` : "";

  const hint = interactive
    ? "\nPress Enter to open it in your browser, or Ctrl+C to stop."
    : " (Ctrl+C to stop)";

  output(
    options,
    { url, network_url: networkUrl },
    `Previewing at ${url}${shared}${hint}`
  );

  if (interactive) {
    openOnEnter(process.stdin, url);
  }

  await once(server, "close");
};

/** A line of redoost list; servers from before versions and expiry don't report them. */
export const siteLine = (site: Deployment & { url: string | null }) => {
  const parts = [
    site.url ?? site.slug,
    plural(site.file_count, "file"),
    formatBytes(site.total_size),
    site.created_at.slice(0, 10),
  ];

  const versions = site.version_count ?? 1;

  if (versions > 1) {
    parts.push(
      `${plural(versions, "version")}, ${formatBytes(site.storage_size)}`
    );
  }

  if (site.enabled === false) {
    parts.push("offline");
  }

  if (site.expires_at) {
    const expired = Date.parse(site.expires_at) <= Date.now();
    parts.push(expired ? "expired" : `expires ${site.expires_at.slice(0, 10)}`);
  }

  if (site.description) {
    parts.push(site.description);
  }

  return parts.join("  ");
};

export const list = async (options: Options) => {
  const api = signedIn(options);
  const found = await api.listDeployments();
  const origin = await sitesOrigin(api);

  const sites = found.map((site) => ({
    ...site,
    url: siteUrl(origin, site.slug),
  }));

  const text =
    sites.length > 0 ? sites.map(siteLine).join("\n") : "No sites yet";

  output(options, sites, text);
};

const versionLine = (version: Version) =>
  [
    version.id,
    version.created_at.slice(0, 16).replace("T", " "),
    plural(version.file_count, "file"),
    formatBytes(version.size),
    ...(version.current ? ["current"] : []),
    ...(version.description ? [version.description] : []),
  ].join("  ");

export const versions = async (options: Options, slug: string) => {
  const found = await signedIn(options).readVersions(slug);
  output(options, found, found.map(versionLine).join("\n"));
};

const previousVersion = async (api: Api, slug: string) => {
  const found = await api.readVersions(slug);
  const earlier = found.find((entry) => !entry.current);

  if (!earlier) {
    throw new Error(`${slug} has no other version to go back to.`);
  }

  return earlier.id;
};

/** Serves an earlier version again, by default the one before the version served. */
export const rollback = async (
  options: Options,
  slug: string,
  version?: string
) => {
  const api = signedIn(options);
  const id = version ?? (await previousVersion(api, slug));
  const site = await api.restoreVersion(slug, id);
  const url = siteUrl(await sitesOrigin(api), slug);
  output(options, { ...site, url }, `${url ?? slug} now serves ${id}`);
};

export const prune = async (options: Options, slug: string) => {
  const site = await signedIn(options).pruneVersions(slug);
  const size = formatBytes(site.storage_size);
  output(options, site, `Kept only the version ${slug} serves, ${size}`);
};

const inBatches: (
  slugs: string[],
  change: (batch: string[]) => Promise<string[]>
) => Promise<string[]> = async (slugs, change) => {
  if (slugs.length === 0) {
    return [];
  }

  const changed = await change(slugs.slice(0, slugsPerRequest));

  return [
    ...changed,
    ...(await inBatches(slugs.slice(slugsPerRequest), change)),
  ];
};

const changeSites = async (
  slugs: string[],
  change: (batch: string[]) => Promise<string[]>
) => {
  const unique = [...new Set(slugs)];
  const found = new Set(await inBatches(unique, change));

  return {
    changed: unique.filter((slug) => found.has(slug)),
    missing: unique.filter((slug) => !found.has(slug)),
  };
};

const report = (
  options: Options,
  field: "changed" | "deleted",
  { changed, missing }: { changed: string[]; missing: string[] },
  text: string
) => {
  if (changed.length > 0 || options.json) {
    output(options, { [field]: changed, missing }, text);
  }

  if (missing.length > 0) {
    throw new Error(`Not found: ${missing.join(", ")}`);
  }
};

/** Takes sites offline or puts them back online, reporting the ones changed even when others weren't found. */
export const switchSites = async (
  options: Options,
  slugs: string[],
  enabled: boolean
) => {
  const api = signedIn(options);

  const result = await changeSites(slugs, async (batch) => {
    const { changed } = await api.changeDeployments(batch, enabled);

    return changed;
  });

  const names = result.changed.join(", ");
  const one = result.changed.length === 1;

  const text = enabled
    ? `${names} ${one ? "is" : "are"} online`
    : `${names} ${one ? "is" : "are"} offline; visitors may still see ${one ? "it" : "them"} for a minute`;

  report(options, "changed", result, text);
};

export const remove = async (options: Options, slugs: string[]) => {
  const api = signedIn(options);

  const result = await changeSites(slugs, async (batch) => {
    const { deleted } = await api.deleteDeployments(batch);

    return deleted;
  });

  report(options, "deleted", result, `Deleted ${result.changed.join(", ")}`);
};

export const describe = async (
  options: Options,
  slug: string,
  description: string
) => {
  const site = await signedIn(options).changeDeployment(slug, { description });

  const text = description.trim()
    ? `Described ${slug}`
    : `Cleared ${slug}'s description`;

  output(options, site, text);
};

/** Sets when a site goes offline; when is that moment, or null for never. */
export const expire = async (
  options: Options,
  slug: string,
  when: string | null
) => {
  const site = await signedIn(options).changeDeployment(slug, {
    expires_at: when,
  });

  const text = when
    ? `${slug} goes offline at ${when.slice(0, 16).replace("T", " ")}`
    : `${slug} no longer expires`;

  output(options, site, text);
};

/**
 * Installs the release the server runs with the package manager that installed
 * this CLI, which checks the package's integrity; its output goes to stderr,
 * keeping stdout for the result.
 */
export const update = async (options: Options) => {
  const { server } = options;
  const available = await serverVersion(server);

  if (!available || !release(available)) {
    throw new Error(`Couldn't tell which version ${server} runs.`);
  }

  const newer = newerRelease(available);

  if (!newer) {
    output(
      options,
      { version: cliVersion, updated: false },
      `redoost ${cliVersion} is up to date`
    );

    return;
  }

  const commands = installCommands(newer);
  const manager = installedWith(runningScript(), globalRoots());

  if (!manager) {
    throw new Error(
      `redoost ${newer} is available, but this redoost wasn't installed with npm or bun. Run ${commands.npm.join(" ")} or ${commands.bun.join(" ")}.`
    );
  }

  const [command = manager, ...args] = commands[manager];

  const installed = spawnSync(command, args, {
    stdio: ["inherit", process.stderr, "inherit"],
    shell: process.platform === "win32",
  });

  if (installed.status !== 0) {
    throw new Error(`Couldn't install redoost ${newer}.`);
  }

  output(
    options,
    { version: newer, updated: true },
    `Updated to redoost ${newer}`
  );
};
