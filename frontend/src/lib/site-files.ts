export type SiteFile = { path: string; file: File };

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

// Without index.html, a lone root HTML file becomes the home page
function toSite(files: SiteFile[]): SiteFile[] {
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
  if (sorted.length === 1) throw new Error("Choose an HTML file or a folder.");
  throw new Error("Add index.html at the root, or choose a single HTML page.");
}

export function pickedFiles(files: FileList): SiteFile[] {
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

export async function fileManifest(files: SiteFile[]) {
  const manifest = [];
  for (const { path, file } of files) {
    const contents = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", contents);
    const digest = new Uint8Array(hash);
    manifest.push({
      path,
      size: file.size,
      sha256: btoa(String.fromCharCode(...digest)),
    });
  }
  return manifest;
}
