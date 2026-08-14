import { describe, expect, it } from "vitest";

import {
  REVIEW_PROGRESS_STANDARD_REMOTE_POLL_MS,
  REVIEW_PROGRESS_TUTORING_REMOTE_POLL_MS,
  rebaseReviewProgressStateRevisionForSend,
  reviewProgressSaveRevisionOf,
} from "./reviewProgressSaveCoordinator";

describe("review progress save coordinator", () => {
  it("rebases a queued revision above the last accepted server revision", () => {
    const rebased = rebaseReviewProgressStateRevisionForSend(
      {
        topics: {
          module: {
            completed: false,
          },
        },
        __saveRevision: 100,
      },
      150,
      120,
    );

    expect(rebased.__saveRevision).toBe(151);
    expect(rebased.topics).toEqual({
      module: {
        completed: false,
      },
    });
  });

  it("never moves backward when the queued revision is already newer", () => {
    const rebased = rebaseReviewProgressStateRevisionForSend(
      {
        value: "learner work",
        __saveRevision: 200,
      },
      150,
      120,
    );

    expect(rebased.__saveRevision).toBe(201);
    expect(rebased.value).toBe("learner work");
  });

  it("reads only finite non-negative revisions", () => {
    expect(reviewProgressSaveRevisionOf({ __saveRevision: 42.9 })).toBe(42);
    expect(reviewProgressSaveRevisionOf({ __saveRevision: -1 })).toBe(0);
    expect(reviewProgressSaveRevisionOf({ __saveRevision: "bad" })).toBe(0);
    expect(reviewProgressSaveRevisionOf(null)).toBe(0);
  });

  it("keeps tutoring live polling fast while normal learner polling is quiet", () => {
    expect(REVIEW_PROGRESS_TUTORING_REMOTE_POLL_MS).toBe(4_000);
    expect(REVIEW_PROGRESS_STANDARD_REMOTE_POLL_MS).toBe(30_000);
  });
});
