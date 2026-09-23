import type { SiteFile } from "./site-files";

export type ManifestFile = { path: string; size: number; sha256: string };

export type Deployment = {
  slug: string;
  state: "uploading" | "ready";
  file_count: number;
  total_size: number;
  created_at: string;
  expires_at: string;
};

export type CreatedDeployment = Deployment & {
  token: string;
  upload_url: string;
  uploads: { path: string; fields: Record<string, string> }[];
};

export type UploadSession = {
  deployment: CreatedDeployment;
  manifest: ManifestFile[];
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

class UploadError extends Error {
  constructor(
    readonly status: number,
    key: string,
  ) {
    super(`Upload failed (${status}) for ${key}.`);
  }
}

async function checkResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map((item: { msg: string }) => item.msg).join("; ")
      : typeof detail === "string"
        ? detail
        : `Request failed (${response.status}).`;
    throw new ApiError(response.status, message);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  await checkResponse(response);
  return response.json() as Promise<T>;
}

function authorization(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function createDeployment(
  files: ManifestFile[],
  token: string | null,
  signal: AbortSignal,
) {
  const response = await fetch("/api/deployments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && authorization(token)),
    },
    body: JSON.stringify({ files }),
    signal,
  });
  return readResponse<CreatedDeployment>(response);
}

export async function completeDeployment(
  deployment: CreatedDeployment,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/deployments/${deployment.slug}/complete`, {
    method: "POST",
    headers: authorization(deployment.token),
    signal,
  });
  return readResponse<Deployment>(response);
}

export async function listDeployments(token: string) {
  const response = await fetch("/api/deployments", {
    headers: authorization(token),
  });
  return readResponse<Deployment[]>(response);
}

export async function deleteDeployment(slug: string, token: string) {
  const response = await fetch(`/api/deployments/${slug}`, {
    method: "DELETE",
    headers: authorization(token),
  });
  await checkResponse(response);
}

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
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(fields))
      form.append(name, value);
    form.append("file", file, file.name);

    const request = new XMLHttpRequest();
    const aborted = () => request.abort();
    const finish = () => signal.removeEventListener("abort", aborted);
    request.open("POST", url);
    request.upload.onprogress = (event) =>
      onProgress(Math.min(event.loaded, file.size));
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
      reject(new DOMException("Upload cancelled", "AbortError"));
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
  deployment: CreatedDeployment,
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
  if (signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
}
