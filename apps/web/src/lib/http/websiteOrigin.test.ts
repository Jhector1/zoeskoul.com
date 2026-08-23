import { describe, expect, it } from "vitest";

import {
  resolveRequestWebsiteOrigin,
  resolveWebsiteOriginForRuntime,
} from "./websiteOrigin";

describe("resolveWebsiteOriginForRuntime", () => {
  it("uses canonical Website origin in real production", () => {
    expect(
      resolveWebsiteOriginForRuntime({
        requestOrigin: "http://localhost:3000",
        nodeEnv: "production",
      }),
    ).toBe("https://zoeskoul.com");
  });

  it("does not trust an internal production request origin", () => {
    expect(
      resolveWebsiteOriginForRuntime({
        requestOrigin: "http://zoeskoul-web:3000",
        nodeEnv: "production",
      }),
    ).toBe("https://zoeskoul.com");
  });

  it("preserves a Vercel Preview request origin", () => {
    expect(
      resolveWebsiteOriginForRuntime({
        requestOrigin: "https://web-preview.zoeskoul.com",
        nodeEnv: "production",
        vercelEnv: "preview",
      }),
    ).toBe("https://web-preview.zoeskoul.com");
  });

  it("preserves localhost in development", () => {
    expect(
      resolveWebsiteOriginForRuntime({
        requestOrigin: "http://localhost:3000",
        nodeEnv: "development",
      }),
    ).toBe("http://localhost:3000");
  });

  it("normalizes request URLs through the request helper", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousVercelEnv = process.env.VERCEL_ENV;

    try {
      (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
      delete process.env.VERCEL_ENV;

      expect(
        resolveRequestWebsiteOrigin(
          new Request("http://zoeskoul-web:3000/api/practice/trial/preview"),
        ),
      ).toBe("https://zoeskoul.com");
    } finally {
      if (previousNodeEnv === undefined) {
        delete (process.env as { NODE_ENV?: string }).NODE_ENV;
      } else {
        (process.env as { NODE_ENV?: string }).NODE_ENV = previousNodeEnv;
      }

      if (previousVercelEnv === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = previousVercelEnv;
      }
    }
  });
});
