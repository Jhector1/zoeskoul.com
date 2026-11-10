import { describe, expect, it } from "vitest";
import { selectVisibilityItems } from "./learningVisibilityView";

const items = [
  { kind: "course" as const, slug: "python", title: "Python Foundations", hidden: false, seeded: true, status: "active" },
  { kind: "catalog" as const, slug: "linux", title: "Linux", hidden: true, seeded: true, status: "active" },
  { kind: "course" as const, slug: "git-foundations", title: "Git Foundations", hidden: false, seeded: false, status: "coming_soon" },
];

describe("Admin discovery list filters", () => {
  it("returns only hidden rows without losing their values", () => {
    expect(selectVisibilityItems(items, "", "hidden")).toEqual([items[1]]);
  });
  it("finds records by title or slug, ignoring case", () => {
    expect(selectVisibilityItems(items, "  PYTHON  ", "all")).toEqual([items[0]]);
    expect(selectVisibilityItems(items, "git-", "visible")).toEqual([items[2]]);
  });
  it("never mutates the original rows", () => {
    selectVisibilityItems(items, "", "all");
    expect(items[0].hidden).toBe(false);
    expect(items).toHaveLength(3);
  });
});
