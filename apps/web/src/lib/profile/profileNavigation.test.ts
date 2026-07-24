import { describe, expect, it } from "vitest";

import { resolveProfileNavigation } from "./profileNavigation";

function itemIds(role: "student" | "teacher" | "admin") {
  return resolveProfileNavigation(role).flatMap((section) =>
    section.items.map((item) => item.id),
  );
}

describe("resolveProfileNavigation", () => {
  it("gives every workspace destination a presentation icon", () => {
    for (const role of ["student", "teacher", "admin"] as const) {
      for (const section of resolveProfileNavigation(role)) {
        for (const item of section.items) {
          expect(item.icon, `${role}:${section.id}:${item.id}`).toBeTruthy();
        }
      }
    }
  });

  it("keeps student learning and billing together without management tools", () => {
    expect(resolveProfileNavigation("student").map((section) => section.id)).toEqual([
      "learning",
      "subscription",
    ]);
    expect(itemIds("student")).toEqual([
      "assigned-courses",
      "student-tutoring",
      "achievements",
      "billing",
    ]);
  });

  it("gives teachers their own teaching subset without billing or admin tools", () => {
    expect(resolveProfileNavigation("teacher").map((section) => section.id)).toEqual([
      "learning",
      "teaching",
    ]);
    expect(itemIds("teacher")).toContain("course-assignments");
    expect(itemIds("teacher")).toContain("student-groups");
    expect(itemIds("teacher")).not.toContain("billing");
    expect(itemIds("teacher")).not.toContain("admin-dashboard");
  });

  it("adds platform administration only for admins", () => {
    expect(resolveProfileNavigation("admin").map((section) => section.id)).toEqual([
      "learning",
      "teaching",
      "administration",
    ]);
    expect(itemIds("admin")).toContain("admin-dashboard");
    expect(itemIds("admin")).toContain("public-challenges");
    expect(itemIds("admin")).not.toContain("billing");
  });
});
