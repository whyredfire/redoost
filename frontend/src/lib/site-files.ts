import { unzip } from "fflate";
import type { Limits } from "./deploy";
import { formatBytes } from "./format";

export type SiteFile = { path: string; file: File };
export type UploadFile = SiteFile & { gzip: boolean };

const compressible =
  /\.(html?|css|[cm]?js|json|map|svg|txt|xml|wasm|webmanifest)$/i;

async function readEntry(
  entry: FileSystemEntry,
  prefix: string,
): Promise<SiteFile[]> {
  if (entry.isDirectory) {
    return readDirectory(
      entry as FileSystemDirectoryEntry,
      `${prefix}${entry.name}/`,
    );
  }

  const file = await new Promise<File>((resolve, reject) =>
    (entry as FileSystemFileEntry).file(resolve, reject),
  );
  return [{ path: `${prefix}${entry.name}`, file }];
}

async function readDirectory(
  directory: FileSystemDirectoryEntry,
  prefix: string,
) {
  const reader = directory.createReader();
  const files: SiteFile[] = [];
  while (true) {
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (entries.length === 0) break;
    for (const child of entries) {
      const childFiles = await readEntry(child, prefix);
      files.push(...childFiles);
    }
  }
  return files;
}

async function unzipped(archive: File): Promise<SiteFile[]> {
  const buffer = await archive.arrayBuffer();
  // fflate always allocates plain ArrayBuffers, which File accepts
  const entries = await new Promise<Record<string, Uint8Array<ArrayBuffer>>>(
    (resolve, reject) =>
      unzip(new Uint8Array(buffer), (error, result) =>
        error
          ? reject(new Error("This zip file can't be read."))
          : resolve(result as Record<string, Uint8Array<ArrayBuffer>>),
      ),
  );
  const files = Object.entries(entries)
    .filter(([path]) => !path.endsWith("/") && !path.startsWith("__MACOSX/"))
    .map(([path, contents]) => ({
      path,
      file: new File([contents], path.split("/").pop()!),
    }));

  // Zips often wrap the site in one folder, like my-site/index.html
  const top = files[0]?.path.split("/")[0];
  if (files.every(({ path }) => path.startsWith(`${top}/`))) {
    return files.map((file) => ({
      ...file,
      path: file.path.slice(top!.length + 1),
    }));
  }
  return files;
}

// A lone zip is unpacked and treated like the folder it contains
async function toSite(files: SiteFile[]): Promise<SiteFile[]> {
  if (files.length === 1 && /\.zip$/i.test(files[0]!.path)) {
    const contents = await unzipped(files[0]!.file);
    return toPages(contents);
  }
  return toPages(files);
}

// Without index.html, a lone root HTML file becomes the home page
function toPages(files: SiteFile[]): SiteFile[] {
  const sorted = files.sort((a, b) => a.path.localeCompare(b.path));
  if (!sorted.length || sorted.some(({ path }) => path === "index.html")) {
    return sorted;
  }

  const pages = sorted.filter(({ path }) => /^[^/]+\.html?$/i.test(path));
  if (pages.length === 1) {
    const renamed = sorted.map((file) =>
      file === pages[0] ? { ...file, path: "index.html" } : file,
    );
    return renamed.sort((a, b) => a.path.localeCompare(b.path));
  }
  if (sorted.length === 1) {
    throw new Error("Choose an HTML file, a zip, or a folder.");
  }
  throw new Error("Add index.html at the root, or choose a single HTML page.");
}

export function pickedFiles(files: FileList): Promise<SiteFile[]> {
  // Folder picks include the folder's name; single file picks have no path
  return toSite(
    Array.from(files, (file) => ({
      file,
      path: file.webkitRelativePath.split("/").slice(1).join("/") || file.name,
    })),
  );
}

export async function droppedFiles(
  items: DataTransferItemList,
): Promise<SiteFile[]> {
  const entries = Array.from(items, (item) => item.webkitGetAsEntry()).filter(
    (entry): entry is FileSystemEntry => entry !== null,
  );
  if (entries.length === 1 && entries[0]!.isDirectory) {
    const files = await readDirectory(
      entries[0] as FileSystemDirectoryEntry,
      "",
    );
    return toSite(files);
  }

  const files = await Promise.all(entries.map((entry) => readEntry(entry, "")));
  return toSite(files.flat());
}

// Text files are uploaded gzipped; CompressionStream gives the same bytes every time, so resumes still match
async function compress(site: SiteFile): Promise<UploadFile> {
  if (!compressible.test(site.path)) return { ...site, gzip: false };
  const stream = site.file.stream().pipeThrough(new CompressionStream("gzip"));
  const packed = await new Response(stream).blob();
  // Tiny files can grow when compressed
  if (packed.size >= site.file.size) return { ...site, gzip: false };
  return {
    path: site.path,
    file: new File([packed], site.file.name),
    gzip: true,
  };
}

export async function compressFiles(
  files: SiteFile[],
  onFile: (file: UploadFile) => void,
) {
  const compressed = [];
  for (const file of files) {
    const result = await compress(file);
    compressed.push(result);
    onFile(result);
  }
  return compressed;
}

export async function fileManifest(files: UploadFile[]) {
  const manifest = [];
  for (const { path, file, gzip } of files) {
    const contents = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", contents);
    const digest = new Uint8Array(hash);
    manifest.push({
      path,
      size: file.size,
      sha256: btoa(String.fromCharCode(...digest)),
      gzip,
    });
  }
  return manifest;
}

// Mirrors the API's checks, so oversized sites are rejected before hashing
export function limitError(files: SiteFile[], limits: Limits) {
  if (files.length > limits.max_deployment_files) {
    return `This site has ${files.length} files; the limit is ${limits.max_deployment_files}.`;
  }
  const large = files.find(({ file }) => file.size > limits.max_file_size);
  if (large) {
    return `${large.path} is ${formatBytes(large.file.size)}; files can be at most ${formatBytes(limits.max_file_size)}.`;
  }
  const total = files.reduce((sum, { file }) => sum + file.size, 0);
  if (total > limits.max_deployment_size) {
    return `This site is ${formatBytes(total)}; sites can be at most ${formatBytes(limits.max_deployment_size)}.`;
  }
  return null;
}
