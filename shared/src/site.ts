import { unzip, unzipSync } from "fflate";

import { formatBytes } from "./format";
import type { Limits, ManifestFile, StoredFile } from "./types";

export interface SiteFile {
  path: string;
  file: Blob;
}

export type UploadFile = SiteFile & {
  gzip: boolean;
  sha256: string;
  originalSha256: string;
};

export type FileChange = "new" | "changed";

export interface SiteCheck {
  label: string;
  passed: boolean;
}

/** A file's path and size, as checked against limits before it's read. */
export interface SizedPath {
  path: string;
  size: number;
}

export const compressible =
  /\.(?:html?|css|[cm]?js|json|map|svg|txt|xml|wasm|webmanifest)$/iu;

/** The API's defaults, so reading is bounded even when no limits were fetched. */
export const defaultLimits: Limits = {
  max_file_size: 20 * 1024 ** 2,
  max_deployment_size: 150 * 1024 ** 2,
  max_deployment_files: 2000,
};

/** Dotfiles like .env and .git/ are never published; .well-known/ is. */
export const hidden = (path: string) =>
  path
    .split("/")
    .some((part) => part.startsWith(".") && part !== ".well-known");

const byPath = (a: SiteFile, b: SiteFile) => a.path.localeCompare(b.path);

/** Sorts the files; without index.html, a lone root HTML file becomes the home page. */
export const toPages = <T extends SiteFile>(files: T[]) => {
  const sorted = files.toSorted(byPath);

  if (!sorted.length || sorted.some(({ path }) => path === "index.html")) {
    return sorted;
  }

  const pages = sorted.filter(({ path }) => /^[^/]+\.html?$/iu.test(path));

  if (pages.length === 1) {
    const renamed = sorted.map((file) =>
      file === pages[0] ? { ...file, path: "index.html" } : file
    );

    return renamed.toSorted(byPath);
  }

  if (sorted.length === 1) {
    throw new Error("Choose an HTML file, a zip, or a folder.");
  }

  return sorted;
};

const withoutWrappingFolder = (files: SiteFile[]) => {
  const top = files[0]?.path.split("/")[0];

  if (
    top !== undefined &&
    files.every(({ path }) => path.startsWith(`${top}/`))
  ) {
    return files.map((file) => ({
      ...file,
      path: file.path.slice(top.length + 1),
    }));
  }

  return files;
};

/**
 * The files a zip publishes; check sees their uncompressed sizes first and throws
 * to stop before anything is decompressed.
 */
export const unzipSite = async (
  archive: Blob,
  check: (entries: SizedPath[]) => void
) => {
  const data = new Uint8Array(await archive.arrayBuffer());
  const entries: SizedPath[] = [];

  try {
    unzipSync(data, {
      filter: ({ name, originalSize }) => {
        if (
          !name.endsWith("/") &&
          !name.startsWith("__MACOSX/") &&
          !hidden(name)
        ) {
          entries.push({ path: name, size: originalSize });
        }

        return false;
      },
    });
  } catch {
    throw new Error("This zip file can't be read.");
  }

  check(entries);
  const wanted = new Set(entries.map(({ path }) => path));

  // oxlint-disable-next-line promise/avoid-new -- Promise.withResolvers is missing before Node 22, which the CLI supports
  const unzipped = new Promise<Record<string, Uint8Array<ArrayBuffer>>>(
    (resolve, reject) => {
      unzip(
        data,
        { filter: ({ name }) => wanted.has(name) },
        (failure, result) => {
          if (failure) {
            reject(new Error("This zip file can't be read."));
          } else {
            // SAFETY: fflate always allocates plain ArrayBuffers, which Blob accepts
            resolve(result as Record<string, Uint8Array<ArrayBuffer>>);
          }
        }
      );
    }
  );

  const files = Object.entries(await unzipped).map(([path, contents]) => ({
    path,
    file: new Blob([contents]),
  }));

  return withoutWrappingFolder(files);
};

/** Fails naming what's too big; note says what the sizes measure, like " uncompressed". */
export const checkSizes = (
  sizes: (SizedPath & { note?: string })[],
  totalNote: string,
  limits: Limits
) => {
  const largest = limits.max_file_size;
  const tooBig = sizes.filter(({ size }) => size > largest);
  const [first] = tooBig;

  if (first) {
    const others = tooBig.length > 1 ? ` (and ${tooBig.length - 1} more)` : "";

    throw new Error(
      `${first.path} is ${formatBytes(first.size)}${first.note ?? ""}${others}; files can be up to ${formatBytes(largest)}.`
    );
  }

  if (sizes.length > limits.max_deployment_files) {
    throw new Error(
      `The site has ${sizes.length} files; sites can have up to ${limits.max_deployment_files}.`
    );
  }

  const total = sizes.reduce((sum, { size }) => sum + size, 0);

  if (total > limits.max_deployment_size) {
    throw new Error(
      `The site is ${formatBytes(total)}${totalNote}; sites can be up to ${formatBytes(limits.max_deployment_size)}.`
    );
  }
};

/** Fails before files are read, so oversized ones never use the memory. */
export const checkUncompressed = (sizes: SizedPath[], limits: Limits) =>
  checkSizes(
    sizes.map((size) => ({ ...size, note: " uncompressed" })),
    " uncompressed",
    limits
  );

/** Fails before uploading, as the server would, but naming what's too big. */
export const checkLimits = (files: UploadFile[], limits: Limits) =>
  checkSizes(
    files.map(({ path, file, gzip }) => ({
      path,
      size: file.size,
      note: gzip ? " compressed" : "",
    })),
    " once compressed",
    limits
  );

/** The dashboard's checklist for a selection. */
export const siteChecks = (files: SiteFile[], limits: Limits | null) => {
  const checks: SiteCheck[] = [
    {
      label: "index.html at the root",
      passed: files.some(({ path }) => path === "index.html"),
    },
  ];

  if (!limits) {
    return checks;
  }

  const total = files.reduce((sum, { file }) => sum + file.size, 0);

  return [
    ...checks,
    {
      label: `Each file up to ${formatBytes(limits.max_file_size)}`,
      passed: files.every(({ file }) => file.size <= limits.max_file_size),
    },
    {
      label: `At most ${limits.max_deployment_files} files`,
      passed: files.length <= limits.max_deployment_files,
    },
    {
      label: `Up to ${formatBytes(limits.max_deployment_size)} in total`,
      passed: total <= limits.max_deployment_size,
    },
  ];
};

// WARNING: CompressionStream must give the same bytes every time, or resumed uploads stop matching
/** Gzips text-like files, keeping the original when that's no smaller. */
export const compress = async (site: SiteFile) => {
  if (!compressible.test(site.path)) {
    return { ...site, gzip: false };
  }

  const stream = site.file.stream().pipeThrough(new CompressionStream("gzip"));
  const packed = await new Response(stream).blob();

  if (packed.size >= site.file.size) {
    return { ...site, gzip: false };
  }

  return { path: site.path, file: packed, gzip: true };
};

/** A file's SHA-256, base64 encoded as the API expects. */
export const digest = async (file: Blob) => {
  const contents = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", contents);

  return btoa(String.fromCodePoint(...new Uint8Array(hash)));
};

/** Compresses and hashes files, four at a time, calling onFile as each is ready. */
export const prepareFiles = async (
  files: SiteFile[],
  onFile?: (file: UploadFile) => void
) => {
  const prepared: UploadFile[] = [];
  let next = 0;

  const worker = async () => {
    const index = next;
    const site = files[index];

    if (!site) {
      return;
    }

    next += 1;

    const packed = await compress(site);
    const originalSha256 = await digest(site.file);
    const sha256 = packed.gzip ? await digest(packed.file) : originalSha256;
    const upload = { ...packed, sha256, originalSha256 };
    prepared[index] = upload;
    onFile?.(upload);

    await worker();
  };

  await Promise.all(Array.from({ length: 4 }, () => worker()));

  return prepared;
};

export const fileManifest = (files: UploadFile[]) =>
  files.map(
    ({ path, file, sha256, gzip, originalSha256 }) =>
      ({
        path,
        size: file.size,
        sha256,
        gzip,
        original_sha256: originalSha256,
      }) satisfies ManifestFile
  );

// WARNING: clients compress the same file to different bytes, so compare original hashes when stored
export const sameFile = (stored: StoredFile, file: UploadFile) =>
  stored.original_sha256
    ? stored.original_sha256 === file.originalSha256
    : stored.sha256 === file.sha256;

/** What publishing files over the stored ones would add, change, and remove. */
export const siteChanges = (
  files: SiteFile[],
  prepared: UploadFile[],
  stored: StoredFile[]
) => {
  const published = new Map(stored.map((file) => [file.path, file]));
  const changes = new Map<string, FileChange>();

  for (const file of prepared) {
    const before = published.get(file.path);

    if (!before) {
      changes.set(file.path, "new");
    } else if (!sameFile(before, file)) {
      changes.set(file.path, "changed");
    }
  }

  const selected = new Set(files.map(({ path }) => path));

  const removed = stored.flatMap(({ path }) =>
    selected.has(path) ? [] : [path]
  );

  return { changes, removed };
};
