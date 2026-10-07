import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveTeacherLocation,
} from "./teacherRoutes";

describe("Teacher route ownership", () => {
  it("owns Teacher home at the root", () => {
    for (const path of ["/", "/en", "/fr/"]) {
      expect(resolveTeacherLocation(path).kind).toBe("home");
    }
  });

  it("owns explicit localized tutoring", () => {
    expect(
      resolveTeacherLocation("/en/tutoring"),
    ).toEqual({
      kind: "tutoring",
      locale: "en",
    });
  });

  it("owns localized classes", () => {
    expect(
      resolveTeacherLocation("/en/classes"),
    ).toEqual({
      kind: "classes",
      locale: "en",
    });
  });

  it("owns localized class creation", () => {
    expect(
      resolveTeacherLocation("/fr/classes/new"),
    ).toEqual({
      kind: "class-new",
      locale: "fr",
    });
  });

  it("owns localized class workspaces", () => {
    expect(
      resolveTeacherLocation("/ht/classes/group-1"),
    ).toEqual({
      kind: "class-detail",
      locale: "ht",
      classId: "group-1",
    });
  });

  it("keeps legacy assignment routes reachable", () => {
    expect(
      resolveTeacherLocation("/en/assignments"),
    ).toEqual({
      kind: "assignments",
      locale: "en",
    });

    expect(
      resolveTeacherLocation("/es/assignments/new"),
    ).toEqual({
      kind: "assignment-new",
      locale: "es",
    });

    expect(
      resolveTeacherLocation("/fr/assignments/assignment-1"),
    ).toEqual({
      kind: "assignment-detail",
      locale: "fr",
      assignmentId: "assignment-1",
    });
  });

  it("keeps reports reachable inside the class area", () => {
    expect(
      resolveTeacherLocation("/fr/reports", "en"),
    ).toEqual({
      kind: "reports",
      locale: "fr",
    });
  });

  it("owns Institution and preserves the legacy School alias", () => {
    expect(
      resolveTeacherLocation("/ht/institution", "en"),
    ).toEqual({ kind: "school", locale: "ht" });

    expect(
      resolveTeacherLocation("/ht/school", "en"),
    ).toEqual({ kind: "school", locale: "ht" });
  });

  it("falls unknown Teacher paths back to home instead of tutoring", () => {
    expect(resolveTeacherLocation("/es/unknown").kind).toBe("home");
  });
});
