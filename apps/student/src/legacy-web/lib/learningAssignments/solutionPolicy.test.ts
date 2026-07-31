import { describe, expect, it } from "vitest";
import { canViewLearningAssignmentSolutions } from "./solutionPolicy";

const now = new Date("2026-07-23T12:00:00.000Z");

describe("learning assignment solution policy", () => {
  it("keeps instructor-only solutions hidden", () => {
    expect(canViewLearningAssignmentSolutions({ policy: "instructor_only", completed: true, now })).toBe(false);
  });

  it("supports completion and due-date release without changing course content", () => {
    expect(canViewLearningAssignmentSolutions({ policy: "after_completion", completed: true, now })).toBe(true);
    expect(
      canViewLearningAssignmentSolutions({
        policy: "after_due_date",
        completed: false,
        dueAt: new Date("2026-07-22T00:00:00.000Z"),
        now,
      }),
    ).toBe(true);
  });
});
