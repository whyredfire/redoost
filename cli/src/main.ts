#!/usr/bin/env node
import { parseArgs } from "node:util";

import { ApiError, errorMessage } from "@redoost/shared";

import { version } from "../package.json";
import * as commands from "./commands";
import { defaultServer } from "./config";
import { expiry, expiryHelp } from "./expiry";
import { notify } from "./updates";

const help = `Publish static sites to redoost.

Usage: redoost <command> [options]

Commands:
  login                       sign in through a link
      --token <token>         sign in with an API token from the dashboard, as in CI
  logout                      forget this sign-in
  whoami                      show who's signed in
  publish <path>              publish a folder, zip, or HTML file
  -u, --update <slug>         replace an existing site's files
  -d, --description <text>    a note to tell the site apart (updates keep the current one without it)
  -m, --message <text>        what this version changes, shown in redoost versions
      --expires <when>        when the site goes offline: a date like 2026-12-31, online
                              through that day, or a time like 2026-12-31T18:00
  preview <path>              serve a folder, zip, or HTML file locally, as it would be published
      --host <host>           address to listen on; 0.0.0.0 for every network (default: 127.0.0.1)
  -p, --port <port>           port to listen on (default: a free one)
  list                        list your sites
  enable <slug>...            put sites back online
  disable <slug>...           take sites offline, keeping their files
  delete <slug>...            delete sites
  versions <slug>             list a site's kept versions
  rollback <slug> [version]   serve an earlier version of a site again (default: the previous one)
  prune <slug>                delete a site's versions other than the one served
  describe <slug> <text>      change a site's description, or "" to clear it
  expire <slug> <when>        set when a site goes offline: a date like 2026-12-31, online
                              through that day, a time like 2026-12-31T18:00, or never
  update                      update the CLI to the server's version

Options:
  -s, --server <url>          redoost dashboard URL (default: ${defaultServer}, or REDOOST_SERVER)
      --json                  print results as JSON
  -v, --version               show the version and exit
  -h, --help                  show this help
`;

const options = {
  server: { type: "string", short: "s" },
  json: { type: "boolean" },
  version: { type: "boolean", short: "v" },
  help: { type: "boolean", short: "h" },
  token: { type: "string" },
  update: { type: "string", short: "u" },
  description: { type: "string", short: "d" },
  message: { type: "string", short: "m" },
  expires: { type: "string" },
  host: { type: "string" },
  port: { type: "string", short: "p" },
} as const;

const parseOptions = (argv: string[]) =>
  parseArgs({ args: argv, options, allowPositionals: true });

type Values = ReturnType<typeof parseOptions>["values"];

class UsageError extends Error {
  override name = "UsageError";
}

const when = (text: string, name: string) => {
  const moment = expiry(text);

  if (moment === null) {
    throw new UsageError(
      `invalid value '${text}' for '${name}': ${expiryHelp}`
    );
  }

  return moment;
};

const portNumber = (text = "0") => {
  if (!/^\d+$/u.test(text) || Number(text) > 65_535) {
    throw new UsageError(
      `invalid value '${text}' for '--port <port>': expected a number from 0 to 65535`
    );
  }

  return Number(text);
};

interface Command {
  args: string;
  options: string[];
  run: (
    context: commands.Options,
    args: string[],
    values: Values
  ) => Promise<void>;
}

const usages = new Map<string, Command>([
  [
    "login",
    {
      args: "",
      options: ["token"],
      run: (context, _args, values) => commands.login(context, values.token),
    },
  ],
  ["logout", { args: "", options: [], run: commands.logout }],
  ["whoami", { args: "", options: [], run: commands.whoami }],
  [
    "publish",
    {
      args: "<path>",
      options: ["update", "description", "message", "expires"],
      run: (context, [site = ""], values) =>
        commands.publish(context, site, {
          ...values,
          expires:
            values.expires === undefined
              ? undefined
              : when(values.expires, "--expires <when>"),
        }),
    },
  ],
  [
    "preview",
    {
      args: "<path>",
      options: ["host", "port"],
      run: (context, [site = ""], values) =>
        commands.preview(
          context,
          site,
          values.host ?? "127.0.0.1",
          portNumber(values.port)
        ),
    },
  ],
  ["list", { args: "", options: [], run: commands.list }],
  [
    "enable",
    {
      args: "<slug>...",
      options: [],
      run: (context, slugs) => commands.switchSites(context, slugs, true),
    },
  ],
  [
    "disable",
    {
      args: "<slug>...",
      options: [],
      run: (context, slugs) => commands.switchSites(context, slugs, false),
    },
  ],
  [
    "delete",
    {
      args: "<slug>...",
      options: [],
      run: (context, slugs) => commands.remove(context, slugs),
    },
  ],
  [
    "versions",
    {
      args: "<slug>",
      options: [],
      run: (context, [slug = ""]) => commands.versions(context, slug),
    },
  ],
  [
    "rollback",
    {
      args: "<slug> [version]",
      options: [],
      run: (context, [slug = "", id]) => commands.rollback(context, slug, id),
    },
  ],
  [
    "prune",
    {
      args: "<slug>",
      options: [],
      run: (context, [slug = ""]) => commands.prune(context, slug),
    },
  ],
  [
    "describe",
    {
      args: "<slug> <description>",
      options: [],
      run: (context, [slug = "", text = ""]) =>
        commands.describe(context, slug, text),
    },
  ],
  [
    "expire",
    {
      args: "<slug> <when>",
      options: [],
      run: (context, [slug = "", text = ""]) =>
        commands.expire(
          context,
          slug,
          text === "never" ? null : when(text, "<when>")
        ),
    },
  ],
  ["update", { args: "", options: [], run: commands.update }],
]);

const globalOptions = new Set(["server", "json", "version", "help"]);

const checkArguments = (
  name: string,
  command: Command,
  args: string[],
  values: Values
) => {
  const other = Object.keys(values).find(
    (option) => !globalOptions.has(option) && !command.options.includes(option)
  );

  if (other) {
    throw new UsageError(`--${other} isn't an option of redoost ${name}`);
  }

  const names = command.args.split(" ").filter(Boolean);
  const required = names.filter((arg) => arg.startsWith("<")).length;
  const most = command.args.endsWith("...") ? Infinity : names.length;

  if (args.length < required) {
    throw new UsageError(
      `${names[args.length]} is missing; usage: redoost ${name} ${command.args}`
    );
  }

  if (args.length > most) {
    throw new UsageError(`unexpected argument '${args[most]}'`);
  }
};

const parse = (argv: string[]) => {
  const { values, positionals } = parseOptions(argv);
  const [name, ...args] = positionals;

  if (values.help || name === "help") {
    return { kind: "print", text: help } as const;
  }

  if (values.version) {
    return { kind: "print", text: `redoost ${version}\n` } as const;
  }

  const command = usages.get(name ?? "");

  if (name === undefined) {
    throw new UsageError("a command is required");
  }

  if (!command) {
    throw new UsageError(`unrecognized command '${name}'`);
  }

  checkArguments(name, command, args, values);
  const server = values.server ?? (process.env.REDOOST_SERVER || defaultServer);

  const context = {
    server: server.replace(/\/+$/u, ""),
    json: values.json ?? false,
  };

  return { kind: "run", name, command, context, args, values } as const;
};

const flushed = (stream: NodeJS.WriteStream) =>
  // oxlint-disable-next-line promise/avoid-new -- write's callback is the only signal that a pipe has taken the output
  new Promise((resolve) => {
    stream.write("", resolve);
  });

const exit = async (code: number) => {
  await Promise.all([flushed(process.stdout), flushed(process.stderr)]);
  process.exit(code);
};

const explain = (cause: unknown, server: string) => {
  if (cause instanceof ApiError && cause.status === 401) {
    return commands.rejected.message;
  }

  if (cause instanceof SyntaxError) {
    return `${server} sent an answer redoost can't read.`;
  }

  if (cause instanceof TypeError) {
    return `Couldn't reach ${server}.`;
  }

  return errorMessage(cause);
};

process.on("SIGINT", async () => {
  const undo = [...commands.undoOnInterrupt];
  commands.undoOnInterrupt.clear();
  await Promise.all(undo.map((step) => step().catch(() => null)));

  if (process.stderr.isTTY) {
    process.stderr.write("\r\u001B[K");
  }

  await exit(130);
});

const usageFailure = (cause: unknown) => {
  process.stderr.write(
    `error: ${errorMessage(cause)}\n\nRun redoost --help for usage.\n`
  );

  return 2;
};

const main = async () => {
  let parsed: ReturnType<typeof parse>;

  try {
    parsed = parse(process.argv.slice(2));
  } catch (error) {
    return usageFailure(error);
  }

  if (parsed.kind === "print") {
    process.stdout.write(parsed.text);

    return 0;
  }

  const { name, command, context, args, values } = parsed;

  try {
    await command.run(context, args, values);
  } catch (error) {
    if (error instanceof UsageError) {
      return usageFailure(error);
    }

    process.stderr.write(`error: ${explain(error, context.server)}\n`);

    return 1;
  }

  if (name !== "update" && !context.json && process.stderr.isTTY) {
    await notify(context.server);
  }

  return 0;
};

await exit(await main());
