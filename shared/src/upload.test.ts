import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import type { SiteFile } from "./site";
import { UploadError, postWithFetch, uploadFiles } from "./upload";
import type { PostFile } from "./upload";

interface Received {
  fields: string[];
  key: string;
  fileName: string;
}

const forms: Received[] = [];
let statuses: number[] = [];

const storage = Bun.serve({
  port: 0,
  fetch: async (request) => {
    const form = await request.formData();
    const file = form.get("file");

    forms.push({
      fields: [...form.keys()],
      key: String(form.get("key")),
      fileName: file instanceof File ? file.name : "",
    });

    return new Response(null, { status: statuses.shift() ?? 204 });
  },
});

const closed = Bun.serve({ port: 0, fetch: () => new Response() });
const unreachable = closed.url.origin;

await closed.stop();

afterAll(async () => {
  await storage.stop();
});

beforeEach(() => {
  forms.length = 0;
  statuses = [];
});

const site = (path: string) =>
  ({ path, file: new Blob(["hello"]) }) satisfies SiteFile;

const deployment = (...paths: string[]) => ({
  upload_url: storage.url.origin,
  uploads: paths.map((path) => ({ path, fields: { key: `site/${path}` } })),
});

const networkErrors = (count: number) => {
  let left = count;

  const post: PostFile = (url, ...rest) => {
    left -= 1;

    return postWithFetch(left >= 0 ? unreachable : url, ...rest);
  };

  return post;
};

const reportBytes: PostFile = (_url, _fields, file, _signal, onBytes) => {
  onBytes(2);
  onBytes(file.file.size);

  return Promise.resolve();
};

describe("uploadFiles", () => {
  test("posts the policy's fields, then the file", async () => {
    await uploadFiles(deployment("css/a.css"), [site("css/a.css")]);

    expect(forms).toEqual([
      { fields: ["key", "file"], key: "site/css/a.css", fileName: "a.css" },
    ]);
  });

  test("uploads only the files the deployment asks for and reports them", async () => {
    const done: string[] = [];
    const files = [site("a.html"), site("same.png"), site("b.css")];

    await uploadFiles(deployment("a.html", "b.css"), files, {
      onProgress: (path, bytes, complete) => {
        if (complete) {
          done.push(`${path}:${bytes}`);
        }
      },
    });

    expect(done.toSorted()).toEqual(["a.html:5", "b.css:5"]);
    expect(forms).toHaveLength(2);
  });

  test("retries 5xx and 429", async () => {
    statuses = [503, 204, 429, 500, 200];
    const files = [site("a"), site("b")];

    await uploadFiles(deployment("a", "b"), files, { concurrency: 1 });
    expect(forms).toHaveLength(5);
  });

  test("retries network errors", async () => {
    await uploadFiles(deployment("a"), [site("a")], {
      post: networkErrors(2),
    });
    expect(forms).toHaveLength(1);
  });

  test("gives up after three attempts", async () => {
    statuses = [500, 500, 500, 200];

    await expect(uploadFiles(deployment("a"), [site("a")])).rejects.toThrow(
      "Upload failed (500) for a."
    );
    expect(forms).toHaveLength(3);
  });

  test("says which file couldn't be sent", async () => {
    await expect(
      uploadFiles(deployment("a.css"), [site("a.css")], {
        post: networkErrors(3),
      })
    ).rejects.toThrow("Couldn't upload a.css.");
  });

  test("doesn't retry what storage rejects", async () => {
    statuses = [403, 200];
    const uploading = uploadFiles(deployment("a"), [site("a")]);

    await expect(uploading).rejects.toBeInstanceOf(UploadError);
    await expect(uploading).rejects.toMatchObject({ status: 403 });
    expect(forms).toHaveLength(1);
  });

  test("stops starting uploads after a failure", async () => {
    statuses = [403, 200, 200];
    const files = [site("a"), site("b"), site("c")];

    await expect(
      uploadFiles(deployment("a", "b", "c"), files, { concurrency: 1 })
    ).rejects.toThrow("Upload failed (403) for a.");
    expect(forms).toHaveLength(1);
  });

  test("throws an AbortError when cancelled, without retrying", async () => {
    const controller = new AbortController();
    let attempts = 0;

    const cancelling: PostFile = (...args) => {
      attempts += 1;
      controller.abort();

      return postWithFetch(...args);
    };

    await expect(
      uploadFiles(deployment("a"), [site("a")], {
        signal: controller.signal,
        post: cancelling,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(attempts).toBe(1);
  });

  test("passes a poster's byte progress on", async () => {
    const progress: [string, number, boolean][] = [];

    await uploadFiles(deployment("a"), [site("a")], {
      post: reportBytes,
      onProgress: (...update) => progress.push(update),
    });

    expect(progress).toEqual([
      ["a", 2, false],
      ["a", 5, false],
      ["a", 5, true],
    ]);
  });
});
