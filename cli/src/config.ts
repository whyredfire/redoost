import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const defaultServer = "https://redoost.whyredfire.dev";

export const configPath = () =>
  path.join(
    process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"),
    "redoost",
    "config.json"
  );

const isString = (value: unknown): value is string => typeof value === "string";

const isTokens = (value: unknown): value is Record<string, string> =>
  value instanceof Object &&
  !Array.isArray(value) &&
  Object.values(value).every(isString);

const readConfig = () => {
  try {
    return JSON.parse(readFileSync(configPath(), "utf-8"));
  } catch {
    return null;
  }
};

/** Each server's token, keyed by its URL; a missing or unreadable file reads as signed out. */
export const loadTokens = () => {
  const tokens = readConfig()?.tokens;

  return new Map(isTokens(tokens) ? Object.entries(tokens) : []);
};

export const saveTokens = (tokens: Map<string, string>) => {
  const file = configPath();
  const temporary = `${file}.${process.pid}.tmp`;

  const config = JSON.stringify(
    { tokens: Object.fromEntries(tokens) },
    null,
    2
  );

  mkdirSync(path.dirname(file), { recursive: true });
  // WARNING: created readable only by the user, then swapped in whole, so tokens never leak or end up half-written
  writeFileSync(temporary, config, { mode: 0o600 });
  renameSync(temporary, file);
};
