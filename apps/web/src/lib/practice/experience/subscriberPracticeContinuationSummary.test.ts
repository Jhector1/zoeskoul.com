import { describe, expect, it } from "vitest";

import type { SubscriberPracticeContinuationSummary } from "./practiceChooserTypes";
import {
  findSubscriberPracticeContinuation,
  samePracticeModuleSelection,
} from "./subscriberPracticeContinuationSummary";

const continuation: SubscriberPracticeContinuationSummary = {
  continuationKey: "python-v2|python-v2-1",
  selection: {
    catalogSlug: "python",
    subjectSlug: "python-v2",
    moduleSlug: "python-v2-1",
    sectionSlug: "",
    topicSlug: "",
  },
  catalogTitle: "Python",
  catalogTitleKey: null,
  courseTitle: "Python for Beginners",
  courseTitleKey: null,
  moduleTitle: "Variables, Input, and Strings",
  moduleTitleKey: null,
  completedCount: 2,
  totalCount: 6,
  lastOpenedAt: "2026-08-22T08:00:00.000Z",
};

describe("canonical Practice continuation identity", () => {
  it("matches the same learner module regardless of section/topic navigation metadata", () => {
    expect(
      samePracticeModuleSelection(continuation.selection, {
        ...continuation.selection,
        sectionSlug: "another-section",
        topicSlug: "another-topic",
      }),
    ).toBe(true);

    expect(
      samePracticeModuleSelection(continuation.selection, {
        ...continuation.selection,
        moduleSlug: "python-v2-2",
      }),
    ).toBe(false);
  });

  it("finds a continuation by module identity only", () => {
    expect(
      findSubscriberPracticeContinuation([continuation], {
        ...continuation.selection,
        sectionSlug: "ignored",
        topicSlug: "ignored",
      })?.continuationKey,
    ).toBe("python-v2|python-v2-1");
  });
});
