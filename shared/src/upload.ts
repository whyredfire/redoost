import type { SiteFile } from "./site";
import type { DeploymentUploads } from "./types";

/** Storage answered with an error status. */
export class UploadError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

/** Sends one file to storage, calling onBytes as it goes if it can tell. */
export type PostFile = (
  url: string,
  fields: Record<string, string>,
  site: SiteFile,
  signal: AbortSignal,
  onBytes: (bytes: number) => void
) => Promise<void>;

const cancelled = () => new DOMException("Upload cancelled", "AbortError");

const uploadTimeout = 60_000;

export const postWithFetch: PostFile = async (url, fields, site, signal) => {
  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }

  // WARNING: S3 reads the fields first, so the file must go last
  form.append("file", site.file, site.path.split("/").pop());
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(uploadTimeout)]),
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    throw new Error(`Couldn't upload ${site.path}.`, { cause: error });
  }

  if (!response.ok) {
    throw new UploadError(
      response.status,
      `Upload failed (${response.status}) for ${site.path}.`
    );
  }
};

const wait = (milliseconds: number) =>
  // oxlint-disable-next-line promise/avoid-new -- Promise.withResolvers is missing before Node 22, which the CLI supports
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const uploadWithRetry = (
  post: PostFile,
  url: string,
  fields: Record<string, string>,
  site: SiteFile,
  signal: AbortSignal,
  onBytes: (bytes: number) => void
) => {
  const attempt = async (number: number) => {
    try {
      await post(url, fields, site, signal, onBytes);
    } catch (error) {
      if (
        signal.aborted ||
        number === 2 ||
        (error instanceof UploadError &&
          error.status < 500 &&
          error.status !== 429)
      ) {
        throw error;
      }

      await wait(300 * (number + 1));
      await attempt(number + 1);
    }
  };

  return attempt(0);
};

export interface UploadOptions {
  /** How many files go at once */
  concurrency?: number;
  signal?: AbortSignal;
  /** Bytes sent of a file so far, and whether it's done */
  onProgress?: (path: string, bytes: number, complete: boolean) => void;
  post?: PostFile;
}

/**
 * Uploads the files the deployment asks for, stopping at the first failure,
 * which it throws; a cancelled upload throws an AbortError DOMException.
 */
export const uploadFiles = async (
  deployment: Pick<DeploymentUploads, "upload_url" | "uploads">,
  files: SiteFile[],
  {
    concurrency = 16,
    signal = new AbortController().signal,
    onProgress,
    post = postWithFetch,
  }: UploadOptions = {}
) => {
  const policies = new Map(
    deployment.uploads.map((upload) => [upload.path, upload.fields])
  );

  const queue = files.flatMap((site) => {
    const fields = policies.get(site.path);

    return fields ? [{ site, fields }] : [];
  });

  let next = 0;
  let failure: Error | undefined;

  const worker = async () => {
    const item = queue[next];

    if (failure || signal.aborted || !item) {
      return;
    }

    next += 1;
    const { site, fields } = item;

    try {
      await uploadWithRetry(
        post,
        deployment.upload_url,
        fields,
        site,
        signal,
        (bytes) => onProgress?.(site.path, bytes, false)
      );
      onProgress?.(site.path, site.file.size, true);
    } catch (error) {
      failure ??= error instanceof Error ? error : new Error(String(error));

      return;
    }

    await worker();
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );

  if (failure) {
    throw failure;
  }

  if (signal.aborted) {
    throw cancelled();
  }
};
