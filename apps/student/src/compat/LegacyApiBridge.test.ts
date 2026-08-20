import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveLegacyApiUrl,
} from "./LegacyApiBridge";

describe("LegacyApiBridge URL routing", () => {
  it("keeps local old APIs on the Vite proxy", () => {
    expect(
      resolveLegacyApiUrl({
        rawUrl:
          "/api/review/module-nav"
          + "?subjectSlug=python-data-functions"
          + "&moduleSlug=python-6-functions-and-modularity",
        browserUrl:
          "http://localhost:3002/en/subjects/python-data-functions",
        apiOrigin:
          "http://localhost:3000",
      }),
    ).toBe(
      "/api/review/module-nav"
      + "?subjectSlug=python-data-functions"
      + "&moduleSlug=python-6-functions-and-modularity",
    );
  });

  it("keeps generated exercise requests on the local proxy", () => {
    expect(
      resolveLegacyApiUrl({
        rawUrl:
          "/api/practice/generate?topic=functions",
        browserUrl:
          "http://localhost:3002/en/python/modules/module/learn",
        apiOrigin:
          "http://localhost:3000",
      }),
    ).toBe(
      "/api/practice/generate?topic=functions",
    );
  });

  it("rewrites old APIs to the website API in production", () => {
    expect(
      resolveLegacyApiUrl({
        rawUrl:
          "/api/review/module-nav?subjectSlug=python",
        browserUrl:
          "https://student.zoeskoul.com/en/python/modules",
        apiOrigin:
          "https://zoeskoul.com",
      }),
    ).toBe(
      "https://zoeskoul.com/api/review/module-nav?subjectSlug=python",
    );
  });

  it.each([
    "/api/student-ui/practice/daily?locale=fr&source=home",
    "/api/practice/daily/start",
    "/api/practice/start",
  ])(
    "rewrites the Daily Practice request %s to Web in production",
    (rawUrl) => {
      expect(
        resolveLegacyApiUrl({
          rawUrl,
          browserUrl:
            "https://student.zoeskoul.com/fr/practice/daily",
          apiOrigin:
            "https://zoeskoul.com",
        }),
      ).toBe(
        `https://zoeskoul.com${rawUrl}`,
      );
    },
  );

  it("does not rewrite non-API URLs", () => {
    expect(
      resolveLegacyApiUrl({
        rawUrl:
          "https://example.com/file.json",
        browserUrl:
          "http://localhost:3002/en/subjects",
        apiOrigin:
          "http://localhost:3000",
      }),
    ).toBe(
      "https://example.com/file.json",
    );
  });
});
