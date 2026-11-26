import { expect, test } from "bun:test";

import { formatBytes, siteUrl } from "./format";

test("formatBytes rounds like the dashboard", () => {
  expect(formatBytes(1023)).toBe("1023 B");
  expect(formatBytes(1025)).toBe("2 KiB");
  expect(formatBytes(10 * 1024 ** 2)).toBe("10 MiB");
  expect(formatBytes(3.45 * 1024 ** 2)).toBe("3.5 MiB");
  expect(formatBytes(2 * 1024 ** 3)).toBe("2 GiB");
});

test("siteUrl puts the slug in front of the sites origin", () => {
  expect(siteUrl("https://redoost.site", "brave-otter-1a2b")).toBe(
    "https://brave-otter-1a2b.redoost.site"
  );
  expect(siteUrl("http://localhost:8080", "a")).toBe("http://a.localhost:8080");
  expect(siteUrl(null, "a")).toBeNull();
});
