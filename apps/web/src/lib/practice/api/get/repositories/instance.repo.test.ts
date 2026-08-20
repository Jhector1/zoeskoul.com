import { describe, expect, it } from "vitest";
import { PracticePurpose } from "@zoeskoul/db";

import {
  buildPracticeExperienceItemKey,
  toDbPurpose,
} from "./instance.repo";

describe("PracticeQuestionInstance purpose persistence", () => {
  it("persists resolved practice purpose instead of falling back to quiz", () => {
    expect(toDbPurpose("practice")).toBe(PracticePurpose.practice);
  });

  it("preserves quiz and project mappings", () => {
    expect(toDbPurpose("quiz")).toBe(PracticePurpose.quiz);
    expect(toDbPurpose("project")).toBe(PracticePurpose.project);
    expect(toDbPurpose(null)).toBe(PracticePurpose.quiz);
  });
});

describe("PracticeQuestionInstance session slot ownership", () => {
  it("reuses the revealed/current slot on refresh and advances only after completion", () => {
    const revealedQ1Refresh = buildPracticeExperienceItemKey({
      sessionId: "session-1",
      sessionMode: "standard",
      answeredCount: 0,
      topicSlug: "topic-a",
      exerciseKey: "q1",
    });
    const duplicateBootRefresh = buildPracticeExperienceItemKey({
      sessionId: "session-1",
      sessionMode: "standard",
      answeredCount: 0,
      topicSlug: "topic-b",
      exerciseKey: "q2",
    });
    const manualNextAfterQ1 = buildPracticeExperienceItemKey({
      sessionId: "session-1",
      sessionMode: "standard",
      answeredCount: 1,
      topicSlug: "topic-b",
      exerciseKey: "q2",
    });

    expect(duplicateBootRefresh).toBe(revealedQ1Refresh);
    expect(manualNextAfterQ1).not.toBe(revealedQ1Refresh);
  });

  it("keeps Daily uniqueness attached to the authored target identity", () => {
    expect(
      buildPracticeExperienceItemKey({
        sessionId: "daily-1",
        sessionMode: "daily_five",
        topicSlug: "topic-a",
        exerciseKey: "q1",
      }),
    ).toBe("daily-five:daily-1:topic-a:q1");
  });
});
