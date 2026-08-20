import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  published: vi.fn(),
  history: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/practice/challenges/publishedCatalog", () => ({
  listPublishedPracticeExerciseOptions: mocks.published,
}));
vi.mock("./subscriberPracticeSessions.server", () => ({
  loadSubscriberModulePracticeHistory: mocks.history,
}));

import { loadSelfPacedPracticeState } from "./selfPacedPracticeState.server";

function option(key: string, topicSlug: string) {
  return {
    id: key,
    catalogSlug: "python",
    catalogTitle: "Python",
    subjectSlug: "python-v2",
    subjectTitle: "Python",
    releaseStatus: "active",
    moduleSlug: "python-v2-2",
    moduleTitle: "Conditions",
    sectionSlug: "if-elif-else",
    sectionTitle: "If",
    sectionRole: "lesson",
    topicSlug,
    topicTitle: topicSlug,
    exerciseKey: key,
    exerciseTitle: key,
    exerciseKind: "code_input",
    exercisePurpose: "practice",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: false,
  } as any;
}

describe("canonical sessionless self-paced state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.published.mockResolvedValue([
      option("choose-even-or-odd", "if-elif-else"),
      option("truthiness", "if-elif-else"),
      option("comparison", "comparisons"),
    ]);
  });

  it("promotes a completion from the other entry origin into an older module run", async () => {
    mocks.history.mockResolvedValue([
      {
        exerciseKey: "choose-even-or-odd",
        topicSlug: "if-elif-else",
        seenAt: new Date("2026-08-20T17:01:00.000Z"),
        completedAt: new Date("2026-08-20T17:01:00.000Z"),
        lastOk: true,
        sessionId: null,
      },
    ]);

    const state = await loadSelfPacedPracticeState({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      practiceRunId: "lesson-run",
      practiceRunStartedAt: "2026-08-20T17:00:00.000Z",
    });

    expect(state.targetCount).toBe(3);
    expect(state.completedPrefix.map((x) => x.exerciseKey)).toContain(
      "choose-even-or-odd",
    );
    expect(state.queue.map((x) => x.exerciseKey)).not.toContain(
      "choose-even-or-odd",
    );
  });

  it("keeps a capped Header run selection deterministic from its baseline", async () => {
    mocks.history.mockResolvedValue([]);
    const state = await loadSelfPacedPracticeState({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      topicSlug: "if-elif-else",
      targetCount: 2,
      practiceRunId: "header-run",
      practiceRunStartedAt: "2026-08-20T17:00:00.000Z",
    });
    expect(state.targetCount).toBe(2);
    expect(state.selectedTargets).toHaveLength(2);
  });
});
