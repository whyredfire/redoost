import { expect, test } from "bun:test";

import { expiry } from "./expiry";

const offset = (moment: Date) => {
  const minutes = -moment.getTimezoneOffset();
  const hours = String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0");

  return `${minutes < 0 ? "-" : "+"}${hours}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
};

test("dates expire at the start of the next local day", () => {
  expect(expiry("2099-12-31")).toBe(
    `2100-01-01T00:00:00${offset(new Date(2100, 0, 1))}`
  );
});

test("times are local unless they say otherwise", () => {
  expect(expiry("2099-12-31T18:30")).toStartWith("2099-12-31T18:30:00");
  expect(expiry("2099-12-31 18:30:15")).toStartWith("2099-12-31T18:30:15");
  expect(Date.parse(expiry("2099-12-31T18:30+02:00") ?? "")).toBe(
    Date.parse("2099-12-31T18:30:00+02:00")
  );
  expect(Date.parse(expiry("2099-12-31T16:30Z") ?? "")).toBe(
    Date.parse("2099-12-31T16:30:00Z")
  );
});

test.each([
  "next week",
  "2099-13-01",
  "2099-02-30",
  "tomorrow!",
  "2099-12-31T25:00",
  "",
])("rejects %p", (text) => {
  expect(expiry(text)).toBeNull();
});
