import { UploadError } from "@redoost/shared";
import type { PostFile } from "@redoost/shared";

const cancelled = () => new DOMException("Upload cancelled", "AbortError");

const stallTimeout = 60_000;

// WARNING: XHR instead of fetch because fetch can't report upload progress
export const postWithProgress: PostFile = async (
  url,
  fields,
  { path, file },
  signal,
  onProgress
) => {
  if (signal.aborted) {
    throw cancelled();
  }

  const { promise, resolve, reject } = Promise.withResolvers<undefined>();
  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }

  form.append("file", file, path.split("/").pop());

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
  request.upload.addEventListener("progress", (event) => {
    clearTimeout(timer);
    timer = setTimeout(stall, stallTimeout);
    onProgress(Math.min(event.loaded, file.size));
  });

  request.addEventListener("load", () => {
    finish();

    if (request.status >= 200 && request.status < 300) {
      resolve(undefined);
    } else {
      reject(
        new UploadError(
          request.status,
          `Upload failed (${request.status}) for ${fields.key ?? path}.`
        )
      );
    }
  });

  request.addEventListener("error", () => {
    finish();
    reject(new Error(`Network error uploading ${fields.key}.`));
  });

  request.addEventListener("abort", () => {
    finish();
    reject(
      stalled ? new Error(`Upload of ${fields.key} stalled.`) : cancelled()
    );
  });

  signal.addEventListener("abort", aborted, { once: true });
  request.send(form);

  await promise;
};
