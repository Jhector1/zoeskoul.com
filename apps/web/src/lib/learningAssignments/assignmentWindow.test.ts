import { describe, expect, it } from "vitest";
import {
  isLearningAssignmentOpen,
  learningAssignmentAvailability,
} from "./assignmentWindow";

const now = new Date("2026-07-23T12:00:00.000Z");

describe("learning assignment windows", () => {
  it("opens only assigned deliveries inside their date window", () => {
    expect(isLearningAssignmentOpen({ status: "assigned" }, now)).toBe(true);
    expect(
      isLearningAssignmentOpen(
        { status: "assigned", availableFrom: new Date("2026-07-24T00:00:00Z") },
        now,
      ),
    ).toBe(false);
    expect(
      isLearningAssignmentOpen(
        { status: "assigned", dueAt: new Date("2026-07-22T00:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("reports learner-facing availability states", () => {
    expect(learningAssignmentAvailability({ status: "draft" }, now)).toBe("draft");
    expect(
      learningAssignmentAvailability(
        { status: "assigned", availableFrom: new Date("2026-07-24T00:00:00Z") },
        now,
      ),
    ).toBe("upcoming");
    expect(learningAssignmentAvailability({ status: "assigned" }, now)).toBe("open");
  });
});
