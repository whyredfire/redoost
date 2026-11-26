import { describe, expect, test } from "bun:test";

import { gunzipSync, strToU8, zipSync } from "fflate";

import {
  checkLimits,
  checkUncompressed,
  compress,
  compressible,
  digest,
  fileManifest,
  hidden,
  prepareFiles,
  siteChanges,
  toPages,
  unzipSite,
} from "./site";
import type { SiteFile, UploadFile } from "./site";

const site = (path: string, contents: string | Uint8Array = "x") =>
  ({ path, file: new Blob([contents]) }) satisfies SiteFile;

const paths = (files: SiteFile[]) => files.map(({ path }) => path);

const limits = {
  max_file_size: 2048,
  max_deployment_size: 4096,
  max_deployment_files: 2,
};

const zip = (files: Record<string, string>) =>
  new Blob([
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, text]) => [name, strToU8(text)])
      )
    ),
  ]);

const texts = async (files: SiteFile[]) =>
  Object.fromEntries(
    await Promise.all(
      files.map(async ({ path, file }) => [path, await file.text()])
    )
  );

const acceptAll = () => null;

const prepared = (path: string, sha256: string, originalSha256: string) =>
  ({
    path,
    file: new Blob(["x"]),
    gzip: sha256 !== originalSha256,
    sha256,
    originalSha256,
  }) satisfies UploadFile;

const sized = (path: string, size: number, gzip: boolean) =>
  ({
    path,
    file: new Blob([new Uint8Array(size)]),
    gzip,
    sha256: "",
    originalSha256: "",
  }) satisfies UploadFile;

describe("hidden", () => {
  test("hides dotfiles and dot folders but not .well-known", () => {
    expect(hidden(".env")).toBe(true);
    expect(hidden(".git/config")).toBe(true);
    expect(hidden("assets/.DS_Store")).toBe(true);
    expect(hidden(".well-known/security.txt")).toBe(false);
    expect(hidden("index.html")).toBe(false);
  });
});

describe("compressible", () => {
  test("matches text-like files, case-insensitively", () => {
    const text = ["a.html", "a.HTM", "a.css", "a.mjs", "a.cjs", "a.js"];
    const data = ["a.json", "a.map", "a.svg", "a.txt", "a.xml", "a.wasm"];
    const manifests = ["a.webmanifest"];
    const binary = ["a.png", "a.jpg", "a.woff2", "a.zip", "html"];

    expect(
      [...text, ...data, ...manifests].every((path) => compressible.test(path))
    ).toBe(true);
    expect(binary.some((path) => compressible.test(path))).toBe(false);
  });
});

describe("compress", () => {
  test("gzips compressible files that get smaller", async () => {
    const text = "body { color: red; }\n".repeat(50);
    const packed = await compress(site("style.css", text));

    expect(packed.gzip).toBe(true);
    expect(packed.file.size).toBeLessThan(text.length);

    const unpacked = gunzipSync(
      new Uint8Array(await packed.file.arrayBuffer())
    );

    expect(new TextDecoder().decode(unpacked)).toBe(text);
  });

  test("keeps files that would grow", async () => {
    const tiny = site("a.txt", "x");
    const packed = await compress(tiny);

    expect(packed.gzip).toBe(false);
    expect(packed.file).toBe(tiny.file);
  });

  test("leaves other files alone", async () => {
    const png = site("photo.png", "a".repeat(1000));

    expect(await compress(png)).toEqual({ ...png, gzip: false });
  });
});

describe("digest", () => {
  test("is the base64 SHA-256", async () => {
    expect(await digest(new Blob(["hello"]))).toBe(
      "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ="
    );
  });
});

describe("prepareFiles and fileManifest", () => {
  test("builds the manifest in the files' order", async () => {
    const css = "p { margin: 0; }\n".repeat(40);

    const files = [
      site("index.html", "<p>hi</p>"),
      site("style.css", css),
      site("a.png", "png"),
    ];

    const seen: string[] = [];
    const ready = await prepareFiles(files, (file) => seen.push(file.path));
    const [html, style, png] = fileManifest(ready);
    const htmlHash = await digest(new Blob(["<p>hi</p>"]));

    expect(seen.toSorted()).toEqual(["a.png", "index.html", "style.css"]);
    expect(paths(ready)).toEqual(["index.html", "style.css", "a.png"]);
    expect(html).toEqual({
      path: "index.html",
      size: 9,
      sha256: htmlHash,
      gzip: false,
      original_sha256: htmlHash,
    });
    expect(style?.gzip).toBe(true);
    expect(style?.size).toBeLessThan(css.length);
    expect(style?.original_sha256).toBe(await digest(new Blob([css])));
    expect(style?.sha256).not.toBe(style?.original_sha256);
    expect(png?.gzip).toBe(false);
  });
});

describe("toPages", () => {
  test("sorts the files", () => {
    const files = [site("b.css"), site("index.html"), site("a.js")];

    expect(paths(toPages(files))).toEqual(["a.js", "b.css", "index.html"]);
  });

  test("makes a lone root HTML file the home page", () => {
    expect(paths(toPages([site("page.HTM"), site("style.css")]))).toEqual([
      "index.html",
      "style.css",
    ]);
    expect(paths(toPages([site("about.html")]))).toEqual(["index.html"]);
  });

  test("leaves sites with index.html or several pages alone", () => {
    expect(paths(toPages([site("index.html"), site("about.html")]))).toEqual([
      "about.html",
      "index.html",
    ]);
    expect(paths(toPages([site("a.html"), site("b.html")]))).toEqual([
      "a.html",
      "b.html",
    ]);
    expect(paths(toPages([site("docs/a.html"), site("b.css")]))).toEqual([
      "b.css",
      "docs/a.html",
    ]);
  });

  test("rejects a single file that isn't a page", () => {
    expect(() => toPages([site("photo.png")])).toThrow(
      "Choose an HTML file, a zip, or a folder."
    );
    expect(toPages([])).toEqual([]);
  });
});

describe("unzipSite", () => {
  test("strips a folder wrapping the whole site", async () => {
    const archive = zip({
      "my-site/index.html": "home",
      "my-site/css/a.css": "a",
    });

    expect(await texts(await unzipSite(archive, acceptAll))).toEqual({
      "index.html": "home",
      "css/a.css": "a",
    });
  });

  test("keeps paths when files sit at the top", async () => {
    const archive = zip({ "index.html": "home", "css/a.css": "a" });
    const files = await unzipSite(archive, acceptAll);

    expect(paths(files).toSorted()).toEqual(["css/a.css", "index.html"]);
  });

  test("skips hidden files and __MACOSX", async () => {
    const archive = zip({
      "index.html": "home",
      ".env": "secret",
      "__MACOSX/._index.html": "junk",
      ".well-known/a.txt": "ok",
    });

    const files = await unzipSite(archive, acceptAll);

    expect(paths(files).toSorted()).toEqual([
      ".well-known/a.txt",
      "index.html",
    ]);
  });

  test("checks sizes before decompressing", async () => {
    const checked: unknown[] = [];
    const archive = zip({ "index.html": "home!", "a.css": "abc" });

    const unzipping = unzipSite(archive, (entries) => {
      checked.push(...entries);
      throw new Error("too big");
    });

    await expect(unzipping).rejects.toThrow("too big");
    expect(checked).toEqual([
      { path: "index.html", size: 5 },
      { path: "a.css", size: 3 },
    ]);
  });

  test("rejects files that aren't zips", async () => {
    await expect(unzipSite(new Blob(["not a zip"]), acceptAll)).rejects.toThrow(
      "This zip file can't be read."
    );
  });
});

describe("size checks", () => {
  test("names the first file that's too big and how many more are", () => {
    const sizes = [
      { path: "photo.png", size: 3072 },
      { path: "big.png", size: 4000 },
      { path: "a.css", size: 1 },
    ];

    const roomy = {
      ...limits,
      max_deployment_files: 5,
      max_deployment_size: 10_000,
    };

    expect(() => checkUncompressed(sizes, roomy)).toThrow(
      "photo.png is 3 KiB uncompressed (and 1 more); files can be up to 2 KiB."
    );
  });

  test("counts files and totals sizes", () => {
    const three = [
      { path: "a", size: 1 },
      { path: "b", size: 1 },
      { path: "c", size: 1 },
    ];

    const large = three.map((file) => ({ ...file, size: 2048 }));

    expect(() => checkUncompressed(three, limits)).toThrow(
      "The site has 3 files; sites can have up to 2."
    );
    expect(() =>
      checkUncompressed(large, { ...limits, max_deployment_files: 5 })
    ).toThrow("The site is 6 KiB uncompressed; sites can be up to 4 KiB.");
    expect(() => checkUncompressed(three.slice(0, 2), limits)).not.toThrow();
  });

  test("notes compressed sizes before uploading", () => {
    const roomy = { ...limits, max_file_size: 4096 };

    expect(() => checkLimits([sized("a.js", 3000, true)], limits)).toThrow(
      "a.js is 3 KiB compressed; files can be up to 2 KiB."
    );
    expect(() => checkLimits([sized("a.png", 3000, false)], limits)).toThrow(
      "a.png is 3 KiB; files can be up to 2 KiB."
    );
    expect(() =>
      checkLimits(
        [sized("a.js", 2048, true), sized("b.png", 2049, false)],
        roomy
      )
    ).toThrow("The site is 5 KiB once compressed; sites can be up to 4 KiB.");
  });
});

describe("siteChanges", () => {
  test("compares original hashes first, then stored ones", () => {
    const files = [
      prepared("index.html", "gz-other-client", "orig-a"),
      prepared("style.css", "gz-b", "orig-b"),
      prepared("a.png", "png", "png"),
      prepared("new.js", "new", "new"),
    ];

    const stored = [
      { path: "index.html", sha256: "gz-a", original_sha256: "orig-a" },
      { path: "style.css", sha256: "gz-b", original_sha256: "orig-changed" },
      { path: "a.png", sha256: "png", original_sha256: null },
      { path: "old.html", sha256: "old", original_sha256: null },
    ];

    const { changes, removed } = siteChanges(files, files, stored);

    expect([...changes]).toEqual([
      ["style.css", "changed"],
      ["new.js", "new"],
    ]);
    expect(removed).toEqual(["old.html"]);
  });

  test("finds nothing to publish when the files match", () => {
    const files = [prepared("index.html", "a", "a")];
    const stored = [{ path: "index.html", sha256: "a", original_sha256: "" }];
    const { changes, removed } = siteChanges(files, files, stored);

    expect(changes.size).toBe(0);
    expect(removed).toEqual([]);
  });
});
