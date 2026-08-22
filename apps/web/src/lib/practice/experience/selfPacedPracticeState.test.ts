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
    sectionSlug: "conditions",
    sectionTitle: "Conditions",
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
    mocks.history.mockResolvedValue([]);
  });

  it("projects completion from any entry origin into the same module state", async () => {
    mocks.history.mockResolvedValue([
      {
        exerciseKey: "choose-even-or-odd",
        topicSlug: "if-elif-else",
        seenAt: new Date("2026-08-22T07:01:00.000Z"),
        completedAt: new Date("2026-08-22T07:01:00.000Z"),
        lastOk: true,
        sessionId: null,
      },
    ]);

    const state = await loadSelfPacedPracticeState({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      practiceRunId: "lesson-run",
      practiceRunStartedAt: "2026-08-22T07:00:00.000Z",
    });

    expect(state.scope).toEqual({
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      sectionSlug: null,
      topicSlug: null,
    });
    expect(state.targetCount).toBe(3);
    expect(state.selectedTargets).toHaveLength(3);
    expect(state.completedPrefix.map((x) => x.exerciseKey)).toContain(
      "choose-even-or-odd",
    );
  });

  it("does not cap subscriber Practice at ten exercises", async () => {
    mocks.published.mockResolvedValue(
      Array.from({ length: 14 }, (_, index) =>
        option(`practice-${index + 1}`, `topic-${(index % 4) + 1}`),
      ),
    );

    const state = await loadSelfPacedPracticeState({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      practiceRunId: "full-module-run",
      practiceRunStartedAt: "2026-08-22T07:00:00.000Z",
    });

    expect(state.scopePoolTotal).toBe(14);
    expect(state.targetCount).toBe(14);
    expect(state.selectedTargets).toHaveLength(14);
    expect(state.queue).toHaveLength(14);
  });

  it("keeps completed exercises in the full module membership", async () => {
    mocks.history.mockResolvedValue([
      {
        exerciseKey: "truthiness",
        topicSlug: "if-elif-else",
        seenAt: new Date("2026-08-22T06:50:00.000Z"),
        completedAt: new Date("2026-08-22T06:50:00.000Z"),
        lastOk: true,
        sessionId: null,
      },
    ]);

    const state = await loadSelfPacedPracticeState({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      practiceRunId: "shared-run",
      practiceRunStartedAt: "2026-08-22T07:00:00.000Z",
    });

    expect(state.selectedTargets).toHaveLength(3);
    expect(state.completedPrefix.map((x) => x.exerciseKey)).toContain(
      "truthiness",
    );
    expect(state.queue).toHaveLength(2);
  });
});
