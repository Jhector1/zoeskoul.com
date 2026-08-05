import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildStudentRouteHandoffUrl,
  resolveStudentRouteHandoff,
} from "./studentRouteHandoff";

describe("Student route handoff", () => {
  it("builds a local Student URL and preserves locale, query, and hash", () => {
    expect(
      buildStudentRouteHandoffUrl({
        currentUrl:
          "http://localhost:3000/fr/subjects/python-v2/modules?tab=practice#exercise",
        environment: "development",
      }),
    ).toBe(
      "http://localhost:3002/fr/subjects/python-v2/modules?tab=practice#exercise",
    );
  });

  it("builds the canonical production Student URL", () => {
    expect(
      buildStudentRouteHandoffUrl({
        currentUrl:
          "https://zoeskoul.com/ht/practice/daily?source=home",
        environment: "production",
      }),
    ).toBe(
      "https://student.zoeskoul.com/ht/practice/daily?source=home",
    );
  });

  it("uses the configured Student preview origin", () => {
    expect(
      buildStudentRouteHandoffUrl({
        currentUrl:
          "https://web-preview.example/en/catalogs?source=header",
        environment: "preview",
        configuredOrigin:
          "https://student-preview.example",
      }),
    ).toBe(
      "https://student-preview.example/en/catalogs?source=header",
    );
  });

  it("fails closed instead of redirecting preview traffic to production", () => {
    expect(
      buildStudentRouteHandoffUrl({
        currentUrl:
          "https://web-preview.example/en/catalogs",
        environment: "preview",
        configuredOrigin: null,
      }),
    ).toBeNull();
  });

  it("refuses Website-owned routes", () => {
    expect(
      buildStudentRouteHandoffUrl({
        currentUrl:
          "https://zoeskoul.com/en/profile",
        environment: "production",
      }),
    ).toBeNull();
  });

  it("rejects malformed current URLs", () => {
    expect(
      buildStudentRouteHandoffUrl({
        currentUrl: "not a URL",
      }),
    ).toBeNull();
  });

  it("activates Daily Practice in production and preserves the query", () => {
    expect(
      resolveStudentRouteHandoff({
        currentUrl:
          "https://zoeskoul.com/fr/practice/daily?source=home",
        environment: "production",
      }),
    ).toBe(
      "https://student.zoeskoul.com/fr/practice/daily?source=home",
    );
  });

  it("uses the configured Student origin for a Daily Practice preview", () => {
    expect(
      resolveStudentRouteHandoff({
        currentUrl:
          "https://web-preview.example/en/practice/daily?source=preview",
        environment: "preview",
        configuredOrigin:
          "https://student-preview.example",
      }),
    ).toBe(
      "https://student-preview.example/en/practice/daily?source=preview",
    );
  });

  it("fails closed for Daily Practice preview without a Student origin", () => {
    expect(
      resolveStudentRouteHandoff({
        currentUrl:
          "https://web-preview.example/en/practice/daily",
        environment: "preview",
        configuredOrigin: null,
      }),
    ).toBeNull();
  });

  it.each([
    [
      "https://zoeskoul.com/en/catalogs?source=header",
      "https://student.zoeskoul.com/en/catalogs?source=header",
    ],
    [
      "https://zoeskoul.com/fr/catalogs/core?source=home",
      "https://student.zoeskoul.com/fr/catalogs/core?source=home",
    ],
  ])(
    "activates the public catalog handoff from %s",
    (currentUrl, expectedUrl) => {
      expect(
        resolveStudentRouteHandoff({
          currentUrl,
          environment: "production",
        }),
      ).toBe(expectedUrl);
    },
  );

  it("uses the configured Student preview origin for catalogs", () => {
    expect(
      resolveStudentRouteHandoff({
        currentUrl:
          "https://web-preview.example/ht/catalogs/core?source=preview",
        environment: "preview",
        configuredOrigin:
          "https://student-preview.example",
      }),
    ).toBe(
      "https://student-preview.example/ht/catalogs/core?source=preview",
    );
  });

  it("fails closed for a catalog preview without a Student origin", () => {
    expect(
      resolveStudentRouteHandoff({
        currentUrl:
          "https://web-preview.example/en/catalogs",
        environment: "preview",
        configuredOrigin: null,
      }),
    ).toBeNull();
  });

  it("activates the exact Subjects entry in production and preserves the query", () => {
    expect(
      resolveStudentRouteHandoff({
        currentUrl:
          "https://zoeskoul.com/fr/subjects?source=header",
        environment: "production",
      }),
    ).toBe(
      "https://student.zoeskoul.com/fr/subjects?source=header",
    );
  });

  it("uses the configured Student preview origin for the Subjects entry", () => {
    expect(
      resolveStudentRouteHandoff({
        currentUrl:
          "https://web-preview.example/ht/subjects?source=preview",
        environment: "preview",
        configuredOrigin:
          "https://student-preview.example",
      }),
    ).toBe(
      "https://student-preview.example/ht/subjects?source=preview",
    );
  });

  it("fails closed for a Subjects preview without a Student origin", () => {
    expect(
      resolveStudentRouteHandoff({
        currentUrl:
          "https://web-preview.example/en/subjects",
        environment: "preview",
        configuredOrigin: null,
      }),
    ).toBeNull();
  });

  it.each([
    "https://zoeskoul.com/en/subjects/python",
    "https://zoeskoul.com/en/subjects/python/modules",
    "https://zoeskoul.com/en/subjects/python/progress",
    "https://zoeskoul.com/en/practice",
    "https://zoeskoul.com/en/practice/daily/extra",
    "https://zoeskoul.com/en/practice/trial",
    "https://zoeskoul.com/en/catalog",
    "https://zoeskoul.com/en/catalogs/core/extra",
    "https://zoeskoul.com/en/catalogs/core/subjects",
    "https://zoeskoul.com/en/catalogs/%2F",
    "https://zoeskoul.com/en/subjects/python/modules/module-1/practice",
    "https://zoeskoul.com/en/sandbox/programming/python",
  ])(
    "does not activate the sibling route %s",
    (currentUrl) => {
      expect(
        resolveStudentRouteHandoff({
          currentUrl,
          environment: "production",
        }),
      ).toBeNull();
    },
  );
});
