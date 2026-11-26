import { expect, test } from "bun:test";

import { spinner } from "./spinner";

const captured = (isTTY: boolean) => {
  const out = {
    isTTY,
    text: "",
    write: (text: string) => {
      out.text += text;

      return true;
    },
  };

  return out;
};

test("prints once outside a terminal", () => {
  const err = captured(false);
  const status = spinner("Uploading 3 files", false, err);
  status.update("Uploading 1 of 3 files");
  status.stop();

  expect(err.text).toBe("Uploading 3 files…\n");
});

test("stays quiet for JSON", () => {
  const err = captured(true);
  spinner("Uploading 3 files", true, err).stop();

  expect(err.text).toBe("");
});

test("animates in a terminal, clearing the line once done", () => {
  const err = captured(true);
  const status = spinner("Uploading 0 of 3 files", false, err);
  status.update("Uploading 2 of 3 files");
  status.stop();

  expect(err.text).toContain("Uploading 2 of 3 files");
  expect(err.text).toEndWith("\r\u001B[K");
});
