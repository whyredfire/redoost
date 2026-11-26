import {
  defaultLimits,
  formatBytes,
  hidden,
  toPages,
  unzipSite,
} from "@redoost/shared";
import type { Limits, SiteFile, SizedPath } from "@redoost/shared";

const isDirectoryEntry = (
  entry: FileSystemEntry
): entry is FileSystemDirectoryEntry => entry.isDirectory;

const readFile = (entry: FileSystemFileEntry) => {
  const { promise, resolve, reject } = Promise.withResolvers<File>();
  entry.file(resolve, reject);

  return promise;
};

const readBatch = (reader: FileSystemDirectoryReader) => {
  const { promise, resolve, reject } =
    Promise.withResolvers<FileSystemEntry[]>();

  reader.readEntries(resolve, reject);

  return promise;
};

const readEntry: (
  entry: FileSystemEntry,
  prefix: string
) => Promise<SiteFile[]> = async (entry, prefix) => {
  if (isDirectoryEntry(entry)) {
    return readDirectory(entry, `${prefix}${entry.name}/`);
  }

  // SAFETY: an entry that isn't a directory is a file
  const file = await readFile(entry as FileSystemFileEntry);

  return [{ path: `${prefix}${entry.name}`, file }];
};

const readInOrder: (
  entries: FileSystemEntry[],
  prefix: string
) => Promise<SiteFile[]> = async (entries, prefix) => {
  const [child, ...rest] = entries;

  if (!child) {
    return [];
  }

  const files = await readEntry(child, prefix);

  return [...files, ...(await readInOrder(rest, prefix))];
};

const readDirectory = (directory: FileSystemDirectoryEntry, prefix: string) => {
  const reader = directory.createReader();

  const readRest: () => Promise<SiteFile[]> = async () => {
    const entries = await readBatch(reader);

    if (entries.length === 0) {
      return [];
    }

    const files = await readInOrder(entries, prefix);

    return [...files, ...(await readRest())];
  };

  return readRest();
};

const checkZip = (entries: SizedPath[], bounds: Limits) => {
  let total = 0;

  for (const [index, { path, size }] of entries.entries()) {
    if (size > bounds.max_file_size) {
      throw new Error(
        `${path} is ${formatBytes(size)} uncompressed; files can be up to ${formatBytes(bounds.max_file_size)}.`
      );
    }

    total += size;

    if (total > bounds.max_deployment_size) {
      throw new Error(
        `This zip expands to more than ${formatBytes(bounds.max_deployment_size)}; sites can be up to ${formatBytes(bounds.max_deployment_size)}.`
      );
    }

    if (index + 1 > bounds.max_deployment_files) {
      throw new Error(
        `This zip has more than ${bounds.max_deployment_files} files; sites can have up to ${bounds.max_deployment_files}.`
      );
    }
  }
};

const unzipped = (archive: Blob, limits: Limits | null) => {
  const bounds = limits ?? defaultLimits;

  if (archive.size > bounds.max_deployment_size) {
    throw new Error(
      `This zip is ${formatBytes(archive.size)}; sites can be up to ${formatBytes(bounds.max_deployment_size)}.`
    );
  }

  return unzipSite(archive, (entries) => checkZip(entries, bounds));
};

const toSite = async (files: SiteFile[], limits: Limits | null) => {
  const [first] = files;

  if (files.length === 1 && first && /\.zip$/iu.test(first.path)) {
    return toPages(await unzipped(first.file, limits));
  }

  return toPages(files.filter(({ path }) => !hidden(path)));
};

export const pickedFiles = (files: FileList, limits: Limits | null) =>
  toSite(
    Array.from(files, (file) => ({
      file,
      path: file.webkitRelativePath.split("/").slice(1).join("/") || file.name,
    })),
    limits
  );

export const droppedFiles = async (
  items: DataTransferItemList,
  limits: Limits | null
) => {
  const entries = Array.from(items, (item) => item.webkitGetAsEntry()).filter(
    (entry): entry is FileSystemEntry => entry !== null
  );

  const [first] = entries;

  if (entries.length === 1 && first && isDirectoryEntry(first)) {
    const files = await readDirectory(first, "");

    return toSite(files, limits);
  }

  const files = await Promise.all(entries.map((entry) => readEntry(entry, "")));

  return toSite(files.flat(), limits);
};
