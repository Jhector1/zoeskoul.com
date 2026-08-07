import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveLogoutWebsiteOrigin,
} from "./logoutWebsiteOrigin";

describe("resolveLogoutWebsiteOrigin", () => {
  it("uses the canonical Website origin in real production", () => {
    expect(
      resolveLogoutWebsiteOrigin({
        requestOrigin: "https://localhost:3000",
        nodeEnv: "production",
        vercelEnv: "production",
      }),
    ).toBe("https://zoeskoul.com");
  });

  it("preserves the public request origin in Vercel Preview", () => {
    expect(
      resolveLogoutWebsiteOrigin({
        requestOrigin: "https://web-preview.zoeskoul.com",
        nodeEnv: "production",
        vercelEnv: "preview",
      }),
    ).toBe("https://web-preview.zoeskoul.com");
  });

  it("preserves localhost in development", () => {
    expect(
      resolveLogoutWebsiteOrigin({
        requestOrigin: "http://localhost:3000",
        nodeEnv: "development",
      }),
    ).toBe("http://localhost:3000");
  });

  it("does not treat an undefined VERCEL_ENV as Preview", () => {
    expect(
      resolveLogoutWebsiteOrigin({
        requestOrigin: "https://localhost:3000",
        nodeEnv: "production",
      }),
    ).toBe("https://zoeskoul.com");
  });
});
