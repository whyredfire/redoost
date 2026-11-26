import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import {
  checkUncompressed,
  defaultLimits,
  hidden,
  toPages,
  unzipSite,
} from "@redoost/shared";
import type { Limits, SiteFile } from "@redoost/shared";

const isFile = (file: string) =>
  statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;

const read = (file: string) => new Blob([readFileSync(file)]);

interface Found {
  name: string;
  file: string;
}

// WARNING: links aren't followed into folders, so they can't loop back into the site
const walk: (folder: string, prefix: string) => Found[] = (folder, prefix) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    const file = path.join(folder, entry.name);

    if (hidden(name)) {
      return [];
    }

    return entry.isDirectory() ? walk(file, `${name}/`) : [{ name, file }];
  });

const readFolder = (folder: string, limits: Limits) => {
  const root = realpathSync(folder);

  // WARNING: links can reach files outside the folder, like ~/.aws/credentials, so those are left out
  const found = walk(folder, "")
    .filter(
      ({ file }) =>
        isFile(file) && realpathSync(file).startsWith(root + path.sep)
    )
    .toSorted((a, b) => (a.name < b.name ? -1 : 1));

  checkUncompressed(
    found.map(({ name, file }) => ({ path: name, size: statSync(file).size })),
    limits
  );

  return found.map(({ name, file }) => ({ path: name, file: read(file) }));
};

/** Reads a folder, zip, or single file as the site it publishes, checking sizes before reading. */
export const readSite = async (site: string, limits = defaultLimits) => {
  const stats = statSync(site, { throwIfNoEntry: false });
  let files: SiteFile[];

  if (stats?.isDirectory()) {
    files = readFolder(site, limits);
  } else if (stats?.isFile() && /\.zip$/iu.test(site)) {
    files = await unzipSite(read(site), (entries) =>
      checkUncompressed(entries, limits)
    );
  } else if (stats?.isFile()) {
    const name = path.basename(site);
    checkUncompressed([{ path: name, size: stats.size }], limits);
    files = [{ path: name, file: read(site) }];
  } else {
    throw new Error(`${site} doesn't exist.`);
  }

  return toPages(files);
};
