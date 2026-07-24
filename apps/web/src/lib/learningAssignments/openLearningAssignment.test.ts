import { describe, expect, it } from "vitest";
import { buildAssignedCourseHref } from "./assignedCourseHref";

describe("buildAssignedCourseHref", () => {
  it("returns the first assigned-course module without a billing URL", () => {
    expect(
      buildAssignedCourseHref({
        locale: "en",
        subjectSlug: "c-data-structures",
        defaultModuleSlug: "module-1",
      }),
    ).toBe("/en/subjects/c-data-structures/modules/module-1");
  });

  it("falls back to the assigned course module list when no default module exists", () => {
    expect(
      buildAssignedCourseHref({
        subjectSlug: "private-course",
        defaultModuleSlug: null,
      }),
    ).toBe("/subjects/private-course/modules");
  });
});
