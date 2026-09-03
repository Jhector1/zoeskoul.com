import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveTeacherLocation,
} from "./teacherRoutes";

describe("Teacher route ownership", () => {
  it("owns localized classes", () => {
    expect(
      resolveTeacherLocation(
        "/en/classes",
      ),
    ).toEqual({
      kind: "classes",
      locale: "en",
    });
  });

  it("owns localized class creation", () => {
    expect(
      resolveTeacherLocation(
        "/fr/classes/new",
      ),
    ).toEqual({
      kind: "class-new",
      locale: "fr",
    });
  });

  it("owns localized class editing", () => {
    expect(
      resolveTeacherLocation(
        "/ht/classes/group-1",
      ),
    ).toEqual({
      kind: "class-detail",
      locale: "ht",
      classId: "group-1",
    });
  });

  it("owns localized assignments", () => {
    expect(
      resolveTeacherLocation(
        "/en/assignments",
      ),
    ).toEqual({
      kind: "assignments",
      locale: "en",
    });
  });

  it("owns localized assignment creation", () => {
    expect(
      resolveTeacherLocation(
        "/es/assignments/new",
      ),
    ).toEqual({
      kind: "assignment-new",
      locale: "es",
    });
  });

  it("owns localized assignment editing", () => {
    expect(
      resolveTeacherLocation(
        "/fr/assignments/assignment-1",
      ),
    ).toEqual({
      kind: "assignment-detail",
      locale: "fr",
      assignmentId:
        "assignment-1",
    });
  });

  it("preserves tutoring for every other Teacher path", () => {
    for (const path of [
      "/",
      "/en",
      "/en/tutoring",
      "/es/schedule",
    ]) {
      expect(
        resolveTeacherLocation(path).kind,
      ).toBe("tutoring");
    }
  });

  it("resolves localized school reports inside Teacher", () => {
    expect(
      resolveTeacherLocation(
        "/fr/reports",
        "en",
      ),
    ).toEqual({
      kind: "reports",
      locale: "fr",
    });
  });


  it("resolves localized School administration inside Teacher", () => {
    expect(resolveTeacherLocation("/ht/school", "en")).toEqual({ kind: "school", locale: "ht" });
  });

});
