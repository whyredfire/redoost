import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { defaultLimits, errorMessage } from "@redoost/shared";
import { strToU8, zipSync } from "fflate";

import { folder, writeFiles } from "./cli.test-utils";
import { readSite } from "./files";

const paths = async (site: string) => {
  const files = await readSite(site);

  return files.map((file) => file.path);
};

const failure = async (site: string, limits = defaultLimits) => {
  try {
    await readSite(site, limits);

    return "";
  } catch (error) {
    return errorMessage(error);
  }
};

const writeZip = (archive: string, entries: Record<string, string>) => {
  const contents = Object.entries(entries).map(([name, text]) => [
    name,
    strToU8(text),
  ]);

  writeFileSync(archive, zipSync(Object.fromEntries(contents)));
};

test("reads folders", async () => {
  const root = folder();
  writeFiles(root, {
    "index.html": "<h1>",
    "assets/app.js": "x",
    ".well-known/a": "",
  });

  expect(await paths(root)).toEqual([
    ".well-known/a",
    "assets/app.js",
    "index.html",
  ]);
});

test("leaves out dotfiles", async () => {
  const root = folder();
  writeFiles(root, {
    "index.html": "<h1>",
    ".env": "SECRET=1",
    ".git/config": "[core]",
  });

  expect(await paths(root)).toEqual(["index.html"]);
});

test.skipIf(process.platform === "win32")(
  "leaves out links to files outside the folder, and doesn't follow links into folders",
  async () => {
    const root = folder();
    const site = path.join(root, "site");
    writeFiles(site, { "index.html": "<h1>", "app.js": "x" });
    writeFiles(root, { credentials: "secret" });
    symlinkSync(path.join(root, "credentials"), path.join(site, "credentials"));
    symlinkSync(path.join(site, "app.js"), path.join(site, "main.js"));
    mkdirSync(path.join(site, "nested"));
    symlinkSync(site, path.join(site, "nested", "loop"));

    expect(await paths(site)).toEqual(["app.js", "index.html", "main.js"]);
  }
);

test("reads zips without their wrapping folder", async () => {
  const archive = path.join(folder(), "site.zip");
  writeZip(archive, {
    "my-site/index.html": "<h1>",
    "my-site/app.js": "x",
    "__MACOSX/my-site/._index.html": "junk",
    "my-site/.DS_Store": "junk",
  });

  expect(await paths(archive)).toEqual(["app.js", "index.html"]);
});

test("rejects unreadable zips", async () => {
  const archive = path.join(folder(), "site.zip");
  writeFileSync(archive, "not a zip");

  expect(await failure(archive)).toBe("This zip file can't be read.");
});

test("rejects oversized zip entries", async () => {
  const archive = path.join(folder(), "site.zip");
  writeZip(archive, { "photo.png": "x".repeat(2048) });

  expect(
    await failure(archive, { ...defaultLimits, max_file_size: 1024 })
  ).toStartWith("photo.png is 2 KiB uncompressed");
});

test("rejects oversized files", async () => {
  const root = folder();
  writeFiles(root, { "photo.png": "x".repeat(2048) });

  expect(
    await failure(root, { ...defaultLimits, max_file_size: 1024 })
  ).toStartWith("photo.png is 2 KiB uncompressed");
});

test("rejects zips that expand past the deployment limit", async () => {
  const archive = path.join(folder(), "site.zip");
  writeZip(archive, {
    "index.html": "x".repeat(1000),
    "app.js": "x".repeat(1000),
  });

  expect(
    await failure(archive, { ...defaultLimits, max_deployment_size: 1024 })
  ).toStartWith("The site is 2 KiB uncompressed");
});

test("a lone HTML file becomes the home page", async () => {
  const root = folder();
  writeFiles(root, {
    "about.html": "<h1>",
    "folder/page.html": "<h1>",
    "folder/style.css": "x",
  });

  expect(await paths(path.join(root, "about.html"))).toEqual(["index.html"]);
  expect(await paths(path.join(root, "folder"))).toEqual([
    "index.html",
    "style.css",
  ]);
});

test("rejects other single files", async () => {
  const root = folder();
  writeFiles(root, { "logo.png": "png" });
  const missing = path.join(root, "missing.html");

  expect(await failure(path.join(root, "logo.png"))).toBe(
    "Choose an HTML file, a zip, or a folder."
  );
  expect(await failure(missing)).toBe(`${missing} doesn't exist.`);
});
