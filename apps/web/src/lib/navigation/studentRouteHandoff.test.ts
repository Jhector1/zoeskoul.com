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

  it.each([
    "https://zoeskoul.com/en/subjects",
    "https://zoeskoul.com/en/catalogs",
    "https://zoeskoul.com/en/practice/daily",
    "https://zoeskoul.com/en/sandbox/programming/python",
  ])(
    "does not activate the Phase 1 route %s",
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
