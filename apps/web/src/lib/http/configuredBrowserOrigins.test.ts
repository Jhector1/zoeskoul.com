import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseConfiguredBrowserOrigins,
} from "./configuredBrowserOrigins";

describe("configured browser origins", () => {
  it("normalizes and deduplicates exact secure origins", () => {
    expect(
      Array.from(
        parseConfiguredBrowserOrigins(
          [
            "https://student-preview.zoeskoul.com",
            "https://student-preview.zoeskoul.com/",
            "http://localhost:3002",
          ].join(","),
        ),
      ),
    ).toEqual([
      "https://student-preview.zoeskoul.com",
      "http://localhost:3002",
    ]);
  });

  it("rejects wildcard, remote HTTP, and non-origin values", () => {
    expect(
      Array.from(
        parseConfiguredBrowserOrigins(
          [
            "*",
            "http://student-preview.zoeskoul.com",
            "https://user:pass@example.com",
            "https://example.com/path",
            "https://example.com?query=1",
            "https://example.com#hash",
            "javascript:alert(1)",
            "not-a-url",
          ].join(" "),
        ),
      ),
    ).toEqual([]);
  });
});
