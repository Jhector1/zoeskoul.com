import { describe, expect, it } from "vitest";
import type { SubscriberPracticeSessionSummary } from "./practiceChooserTypes";
import {
  findActiveSubscriberPracticeSession,
  samePracticeSelection,
} from "./subscriberPracticeSessionSummary";

const base: SubscriberPracticeSessionSummary = {
  sessionId: "session-1",
  selection: {
    catalogSlug: "python",
    subjectSlug: "python-v2",
    moduleSlug: "python-v2-module-0",
    sectionSlug: "python-v2-section-0",
    topicSlug: "what-python-is",
  },
  catalogTitle: "Python",
  catalogTitleKey: null,
  courseTitle: "Python for Beginners",
  courseTitleKey: null,
  moduleTitle: "Getting Started",
  moduleTitleKey: null,
  sectionTitle: "Orientation",
  sectionTitleKey: null,
  topicTitle: "What Python Is",
  topicTitleKey: null,
  completedCount: 2,
  totalCount: 7,
  lastOpenedAt: "2026-07-22T18:00:00.000Z",
};

describe("subscriber practice session summaries", () => {
  it("matches the exact authored topic scope", () => {
    expect(samePracticeSelection(base.selection, { ...base.selection })).toBe(
      true,
    );
    expect(
      samePracticeSelection(base.selection, {
        ...base.selection,
        topicSlug: "moving-around",
      }),
    ).toBe(false);
  });

  it("finds the unfinished session for the selected topic", () => {
    expect(
      findActiveSubscriberPracticeSession([base], base.selection)?.sessionId,
    ).toBe("session-1");
  });
});
