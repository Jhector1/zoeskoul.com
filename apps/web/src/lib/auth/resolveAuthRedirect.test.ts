import { describe, expect, it } from "vitest";

import { resolveAuthRedirect } from "./resolveAuthRedirect";

describe("resolveAuthRedirect", () => {
  const baseUrl = "https://zoeskoul.com";

  it("keeps relative callbacks on the website", () => {
    expect(
      resolveAuthRedirect({
        url: "/en/profile",
        baseUrl,
        includeLocalApps: false,
      }),
    ).toBe("https://zoeskoul.com/en/profile");
  });

  it("allows exact production app origins", () => {
    expect(
      resolveAuthRedirect({
        url: "https://student.zoeskoul.com/learning",
        baseUrl,
        includeLocalApps: false,
      }),
    ).toBe("https://student.zoeskoul.com/learning");
  });

  it("allows exact local app origins only during local development", () => {
    const localUrl = "http://localhost:3002/assignments";

    expect(
      resolveAuthRedirect({
        url: localUrl,
        baseUrl: "http://localhost:3000",
        includeLocalApps: true,
      }),
    ).toBe(localUrl);

    expect(
      resolveAuthRedirect({
        url: localUrl,
        baseUrl,
        includeLocalApps: false,
      }),
    ).toBe("https://zoeskoul.com/en");
  });

  it("rejects lookalike and unrelated origins", () => {
    expect(
      resolveAuthRedirect({
        url: "https://student.zoeskoul.com.evil.example/learning",
        baseUrl,
        includeLocalApps: false,
      }),
    ).toBe("https://zoeskoul.com/en");
  });
});
