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
      files.push(...(await readEntry(child, prefix)));
    }
  }
  return files;
}

export function pickedFiles(files: FileList): SiteFile[] {
  return Array.from(files, (file) => ({
    file,
    path: file.webkitRelativePath.split("/").slice(1).join("/"),
  })).sort((a, b) => a.path.localeCompare(b.path));
}

export async function droppedFiles(
  items: DataTransferItemList,
): Promise<SiteFile[]> {
  const entries = Array.from(items, (item) => item.webkitGetAsEntry()).filter(
    (entry): entry is FileSystemEntry => entry !== null,
  );
  if (entries.length !== 1 || !entries[0]!.isDirectory) {
    throw new Error("Drop one folder, or use the folder picker.");
  }

  return (await readDirectory(entries[0] as FileSystemDirectoryEntry, "")).sort(
    (a, b) => a.path.localeCompare(b.path),
  );
}

export async function fileManifest(files: SiteFile[]) {
  const manifest = [];
  for (const { path, file } of files) {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    );
    manifest.push({
      path,
      size: file.size,
      sha256: btoa(String.fromCharCode(...digest)),
    });
  }
  return manifest;
}
