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

function option(key: string) {
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
    topicSlug: "if-elif-else",
    topicTitle: "If / elif / else",
    exerciseKey: key,
    exerciseTitle: key,
    exerciseKind: "code_input",
    exercisePurpose: "practice",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: false,
  } as any;
}

describe("self-paced completed inspection history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.published.mockResolvedValue([
      option("choose-even-or-odd"),
      option("truthiness"),
    ]);
  });

  it("projects the latest safe completed review in canonical authored order", async () => {
    const review = {
      instanceId: "completed-instance-1",
      createdAt: "2026-08-22T07:00:30.000Z",
      answeredAt: "2026-08-22T07:01:00.000Z",
      topic: "if-elif-else",
      kind: "code_input",
      title: "choose-even-or-odd",
      prompt: "Choose even or odd",
      publicPayload: {
        exerciseKey: "choose-even-or-odd",
        topic: "if-elif-else",
        kind: "code_input",
        title: "choose-even-or-odd",
        prompt: "Choose even or odd",
      },
      lastOk: true,
      lastAnswerPayload: {
        kind: "code_input",
        code: "number = int(input())\nprint(number % 2)\n",
      },
    };

    mocks.history.mockResolvedValue([
      {
        exerciseKey: "choose-even-or-odd",
        topicSlug: "if-elif-else",
        seenAt: new Date("2026-08-22T07:01:00.000Z"),
        completedAt: new Date("2026-08-22T07:01:00.000Z"),
        lastOk: true,
        sessionId: null,
        review,
      },
    ]);

    const state = await loadSelfPacedPracticeState({
      userId: "learner-1",
      subjectSlug: "python-v2",
      moduleSlug: "python-v2-2",
      practiceRunId: "shared-run",
      practiceRunStartedAt: "2026-08-22T07:00:00.000Z",
    });

    expect(state.completedPrefix.map((item) => item.exerciseKey)).toEqual([
      "choose-even-or-odd",
    ]);
    expect(state.completedHistory).toEqual([review]);
    expect(state.queue.map((item) => item.exerciseKey)).toEqual(["truthiness"]);
  });
});
