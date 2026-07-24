import { describe, expect, it } from "vitest";

import type { ReviewProgressState } from "@/lib/review/progressTypes";
import { mergeReviewProgressForSave } from "./mergeProgressForSave";

function state(value: Partial<ReviewProgressState>): ReviewProgressState {
  return { topics: {}, ...value } as ReviewProgressState;
}

describe("mergeReviewProgressForSave", () => {
  it("preserves progress written by another tab", () => {
    const merged = mergeReviewProgressForSave({
      previousState: state({
        topics: { first: { completed: true } },
      }),
      incomingState: state({
        topics: { second: { completed: true } },
      }),
      saveRevision: 7,
    });

    expect(merged.topics.first?.completed).toBe(true);
    expect(merged.topics.second?.completed).toBe(true);
    expect((merged as { __saveRevision?: number }).__saveRevision).toBe(7);
  });

  it("keeps completion when an older tab sends an incomplete copy", () => {
    const merged = mergeReviewProgressForSave({
      previousState: state({ moduleCompleted: true }),
      incomingState: state({}),
      saveRevision: 8,
    });

    expect(merged.moduleCompleted).toBe(true);
  });

  it("honors a newer explicit module reset", () => {
    const merged = mergeReviewProgressForSave({
      previousState: state({
        quizVersion: 1,
        moduleCompleted: true,
        topics: { first: { completed: true } },
      }),
      incomingState: state({
        quizVersion: 2,
        moduleCompleted: false,
        topics: {},
      }),
      saveRevision: 9,
    });

    expect(merged.moduleCompleted).toBe(false);
    expect(merged.topics).toEqual({});
  });
});
