import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getProductionAppOrigin,
} from "@zoeskoul/app-config";

import {
  resolveAuthRedirect,
  resolveRequestedAuthCallback,
} from "./resolveAuthRedirect";

describe("resolveRequestedAuthCallback", () => {
  it.each([
    "http://localhost:3002/en/subjects/python-data-functions/modules",
    "http://localhost:3002/en/subjects/python-data-functions/modules?tab=practice",
    "http://localhost:3002/en/subjects/python-data-functions/modules?tab=practice#functions",
    "http://localhost:3003/en/tutoring/sessions/session-123",
  ])(
    "preserves a trusted local deep link: %s",
    (url) => {
      expect(
        resolveRequestedAuthCallback({
          rawCallbackUrl: url,
          locale: "en",
          includeLocalApps: true,
        }),
      ).toBe(url);
    },
  );

  it.each([
    `${getProductionAppOrigin("student")}/en/subjects/python-data-functions/modules`,
    `${getProductionAppOrigin("teacher")}/en/tutoring/sessions/session-123`,
  ])(
    "preserves a trusted production deep link: %s",
    (url) => {
      expect(
        resolveRequestedAuthCallback({
          rawCallbackUrl: url,
          locale: "en",
          includeLocalApps: false,
        }),
      ).toBe(url);
    },
  );

  it.each([
    "https://evil.example/path",
    "https://student.zoeskoul.com.evil.example/path",
    "//evil.example/path",
    "javascript:alert(1)",
    "data:text/html,test",
    "http://user:password@localhost:3002/path",
    "not a valid URL",
    "https://%",
  ])(
    "falls back safely for an unsafe callback: %s",
    (rawCallbackUrl) => {
      expect(
        resolveRequestedAuthCallback({
          rawCallbackUrl,
          locale: "fr",
          includeLocalApps: true,
        }),
      ).toBe("http://localhost:3000/fr");
    },
  );

  it("keeps local callbacks disabled in production", () => {
    expect(
      resolveRequestedAuthCallback({
        rawCallbackUrl:
          "http://localhost:3002/en/subjects/python-data-functions/modules",
        locale: "en",
        includeLocalApps: false,
      }),
    ).toBe("https://zoeskoul.com/en");
  });
});

describe("resolveAuthRedirect", () => {
  const baseUrl = "https://zoeskoul.com";

  it("resolves a valid Web-relative callback against Web", () => {
    expect(
      resolveAuthRedirect({
        url: "/en/profile?from=auth#details",
        baseUrl,
        includeLocalApps: false,
      }),
    ).toBe(
      "https://zoeskoul.com/en/profile?from=auth#details",
    );
  });

  it.each([
    "https://student.zoeskoul.com/en/subjects/python/modules?tab=practice#functions",
    "https://teacher.zoeskoul.com/en/tutoring/sessions/session-123",
  ])(
    "returns a trusted application URL unchanged: %s",
    (url) => {
      expect(
        resolveAuthRedirect({
          url,
          baseUrl,
          includeLocalApps: false,
        }),
      ).toBe(url);
    },
  );

  it("preserves encoded callback data", () => {
    const url =
      "https://student.zoeskoul.com/en/subjects/python/modules?next=%2Fen%2Fpractice%3Fmode%3Ddaily#functions";

    expect(
      resolveAuthRedirect({
        url,
        baseUrl,
        includeLocalApps: false,
      }),
    ).toBe(url);
  });

  it("allows exact local app origins only during development", () => {
    const localUrl =
      "http://localhost:3002/en/assignments";

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

  it.each([
    "https://evil.example/path",
    "https://student.zoeskoul.com.evil.example/learning",
    "http://user:password@localhost:3002/path",
  ])(
    "falls back for an unsafe absolute callback: %s",
    (url) => {
      expect(
        resolveAuthRedirect({
          url,
          baseUrl,
          includeLocalApps: false,
        }),
      ).toBe("https://zoeskoul.com/en");
    },
  );
});
