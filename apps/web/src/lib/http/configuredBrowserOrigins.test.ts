import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getConfiguredBrowserOrigins,
  parseConfiguredBrowserOrigins,
} from "./configuredBrowserOrigins";

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("trusts the configured Student preview origin without another variable", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_STUDENT_APP_ORIGIN",
      "https://student-preview.example/",
    );

    expect(Array.from(getConfiguredBrowserOrigins())).toContain(
      "https://student-preview.example",
    );
  });
});
