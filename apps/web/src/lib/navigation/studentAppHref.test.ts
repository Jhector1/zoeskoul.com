import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildStudentAppHref,
  studentAppOrigin,
} from "./studentAppHref";

describe("Student application hrefs", () => {
  it("uses the local Student origin outside production", () => {
    expect(studentAppOrigin("development")).toBe(
      "http://localhost:3002",
    );
    expect(
      buildStudentAppHref({
        pathname: "/catalogs",
        locale: "fr",
        environment: "development",
      }),
    ).toBe("http://localhost:3002/fr/catalogs");
  });

  it("uses the production Student origin in production", () => {
    expect(studentAppOrigin("production")).toBe(
      "https://student.zoeskoul.com",
    );
    expect(
      buildStudentAppHref({
        pathname: "/practice/daily?source=home#today",
        locale: "ht",
        environment: "production",
      }),
    ).toBe(
      "https://student.zoeskoul.com/ht/practice/daily?source=home#today",
    );
  });
});
