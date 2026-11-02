import type { DeploymentUploads } from "./deploy";
import type { SiteFile } from "./site-files";

class UploadError extends Error {
  constructor(
    readonly status: number,
    key: string,
  ) {
    super(`Upload failed (${status}) for ${key}.`);
  }
}

function cancelled() {
  return new DOMException("Upload cancelled", "AbortError");
}

// An upload with no progress for this long has stalled, so it's retried
const stallTimeout = 60_000;

// XHR instead of fetch because fetch can't report upload progress
function postFile(
  url: string,
  fields: Record<string, string>,
  file: File,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(cancelled());
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(fields))
      form.append(name, value);
    form.append("file", file, file.name);

    const request = new XMLHttpRequest();
    const aborted = () => request.abort();
    let stalled = false;
    const stall = () => {
      stalled = true;
      request.abort();
    };
    let timer = setTimeout(stall, stallTimeout);
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
    };
    request.open("POST", url);
    request.upload.onprogress = (event) => {
      clearTimeout(timer);
      timer = setTimeout(stall, stallTimeout);
      onProgress(Math.min(event.loaded, file.size));
    };
    request.onload = () => {
      finish();
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new UploadError(request.status, fields.key ?? file.name));
    };
    request.onerror = () => {
      finish();
      reject(new Error(`Network error uploading ${fields.key}.`));
    };
    request.onabort = () => {
      finish();
      reject(
        stalled ? new Error(`Upload of ${fields.key} stalled.`) : cancelled(),
      );
    };
    signal.addEventListener("abort", aborted, { once: true });
    request.send(form);
  });
}

async function uploadWithRetry(
  url: string,
  fields: Record<string, string>,
  file: File,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await postFile(url, fields, file, signal, onProgress);
      return;
    } catch (error) {
      if (
        signal.aborted ||
        attempt === 2 ||
        (error instanceof UploadError &&
          error.status < 500 &&
          error.status !== 429)
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
}

const parallelUploads = 32;

export async function uploadFiles(
  deployment: DeploymentUploads,
  files: SiteFile[],
  signal: AbortSignal,
  onProgress: (path: string, bytes: number, complete: boolean) => void,
) {
  const policies = new Map(
    deployment.uploads.map((upload) => [upload.path, upload.fields]),
  );
  let next = 0;
  let error: Error | undefined;

  async function worker() {
    while (!error && !signal.aborted && next < files.length) {
      const { path, file } = files[next++]!;
      const fields = policies.get(path);
      if (!fields) {
        error = new Error(`No upload policy for ${path}.`);
        return;
      }

      try {
        await uploadWithRetry(
          deployment.upload_url,
          fields,
          file,
          signal,
          (bytes) => onProgress(path, bytes, false),
        );
        onProgress(path, file.size, true);
      } catch (cause) {
        error ??= cause instanceof Error ? cause : new Error(String(cause));
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(parallelUploads, files.length) }, () =>
      worker(),
    ),
  );
  if (error) throw error;
  if (signal.aborted) throw cancelled();
}
