import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveStudentLocation,
} from "./studentRoutes";

describe("original subject-first learning URLs", () => {
  it("opens Start module in the review player", () => {
    expect(
      resolveStudentLocation(
        "/en/sql/modules/sql_module_2/learn",
      ),
    ).toEqual({
      kind: "lesson",
      locale: "en",
      subjectSlug: "sql",
      moduleSlug: "sql_module_2",
    });
  });

  it("supports nonlocalized subject-first links", () => {
    expect(
      resolveStudentLocation(
        "/sql/modules/sql_module_2/learn",
      ),
    ).toEqual({
      kind: "lesson",
      locale: "en",
      subjectSlug: "sql",
      moduleSlug: "sql_module_2",
    });
  });

  it("keeps deep lesson targets in the lesson player", () => {
    expect(
      resolveStudentLocation(
        "/fr/sql/modules/sql_module_2/learn/"
          + "queries/select/exercise/first-query",
      ),
    ).toEqual({
      kind: "lesson",
      locale: "fr",
      subjectSlug: "sql",
      moduleSlug: "sql_module_2",
    });
  });

  it("supports original subject-first course and module pages", () => {
    expect(
      resolveStudentLocation(
        "/en/sql/modules",
      ),
    ).toEqual({
      kind: "course",
      locale: "en",
      subjectSlug: "sql",
    });

    expect(
      resolveStudentLocation(
        "/en/sql/modules/sql_module_2",
      ),
    ).toEqual({
      kind: "module",
      locale: "en",
      subjectSlug: "sql",
      moduleSlug: "sql_module_2",
    });
  });
});
