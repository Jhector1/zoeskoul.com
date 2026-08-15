import { describe, expect, it, vi } from "vitest";
import {
  buildReviewProgressPayload,
} from "@zoeskoul/learning-client/legacy-compatible/review/progressClient";
import {
  mergeReviewProgressForConflictRetry,
  normalizeReviewProgressForClientSync,
  withoutReviewProgressSaveRevision,
} from "@zoeskoul/learning-runtime";
import {
  preserveLocalWorkspaceNavigation,
  savedStarterHashMatchesRuntimeStarter,
  workspaceContentHash,
} from "@zoeskoul/workspace-contracts";

function makeWorkspace(args: {
  activeFileId?: string;
  openTabs?: string[];
  expanded?: string[];
  nodes?: Array<Record<string, unknown>>;
}) {
  return {
    version: 2,
    language: "python",
    nodes: args.nodes ?? [
      { id: "a", kind: "file", name: "a.py", content: "a" },
      { id: "b", kind: "file", name: "b.py", content: "b" },
    ],
    openTabs: args.openTabs ?? ["a"],
    activeFileId: args.activeFileId ?? "a",
    entryFileId: "a",
    stdin: "",
    expanded: args.expanded ?? [],
    leftPct: 50,
  };
}

describe("review progress synchronization contracts", () => {
  it("normalizes topic keys without inventing an active topic", () => {
    expect(
      normalizeReviewProgressForClientSync({
        topics: {
          "section.topic-a": { completed: true },
        },
      }),
    ).toMatchObject({
      activeTopicId: undefined,
      topics: {
        "topic-a": { completed: true },
      },
    });
  });

  it("keeps newer learner work during a conflict retry", () => {
    vi.spyOn(Date, "now").mockReturnValue(900);

    const merged = mergeReviewProgressForConflictRetry(
      {
        topics: {
          topic: {
            runtimeStateV2: {
              exercises: {
                q1: {
                  updatedAt: 10,
                  workspaceOrigin: "saved",
                  code: "remote",
                },
              },
            },
          },
        },
        __saveRevision: 50,
      },
      {
        topics: {
          topic: {
            runtimeStateV2: {
              exercises: {
                q1: {
                  updatedAt: 20,
                  workspaceOrigin: "user",
                  code: "local",
                },
              },
            },
          },
        },
        __saveRevision: 51,
      },
    );

    expect(
      merged.topics?.topic?.runtimeStateV2?.exercises?.q1,
    ).toMatchObject({
      code: "local",
      updatedAt: 20,
    });
    expect(merged.__saveRevision).toBe(900);

    vi.restoreAllMocks();
  });

  it("strips save revisions recursively", () => {
    expect(
      withoutReviewProgressSaveRevision({
        __saveRevision: 4,
        nested: {
          __saveRevision: 5,
          value: true,
        },
        list: [
          {
            __saveRevision: 6,
            value: "ok",
          },
        ],
      }),
    ).toEqual({
      nested: { value: true },
      list: [{ value: "ok" }],
    });
  });

  it("hashes workspace content independently of node order", () => {
    const first = makeWorkspace({
      nodes: [
        { id: "b", kind: "file", name: "b.py", content: "b" },
        { id: "a", kind: "file", name: "a.py", content: "a" },
      ],
    });
    const second = makeWorkspace({
      nodes: [
        { id: "a", kind: "file", name: "a.py", content: "a" },
        { id: "b", kind: "file", name: "b.py", content: "b" },
      ],
    });

    expect(workspaceContentHash(first)).toBe(
      workspaceContentHash(second),
    );
  });

  it("preserves valid local navigation only", () => {
    const incoming = makeWorkspace({
      activeFileId: "a",
      openTabs: ["a"],
      expanded: ["incoming"],
    });
    const local = makeWorkspace({
      activeFileId: "b",
      openTabs: ["b", "missing"],
      expanded: ["local"],
    });

    expect(
      preserveLocalWorkspaceNavigation(incoming, local),
    ).toMatchObject({
      activeFileId: "b",
      openTabs: ["b", "a"],
      expanded: ["local"],
    });
  });

  it("matches a saved starter hash to the current workspace", () => {
    const current = makeWorkspace({});
    const starterHash = workspaceContentHash(current);

    expect(
      savedStarterHashMatchesRuntimeStarter({
        saved: { starterHash },
        existingWorkspace: current,
      }),
    ).toBe(true);
  });

  it("projects outgoing progress to the complete authored module topic scope", () => {
    const payload = buildReviewProgressPayload({
      subjectSlug: "sql-data-management",
      moduleSlug: "module-1",
      locale: "en",
      moduleTopicIds: [
        "section-1.current-a",
        "current-b",
        "section-1.current-a",
      ],
      state: {
        activeTopicId: "foreign-topic",
        topics: {
          "section-1.current-a": {
            completed: true,
          },
          "current-b": {
            completed: true,
          },
          "foreign-topic": {
            completed: true,
          },
        },
      },
      activeTopicId: "section-1.current-a",
    });

    expect(payload.moduleTopicIds).toEqual([
      "current-a",
      "current-b",
    ]);
    expect(Object.keys(payload.state.topics ?? {}).sort()).toEqual([
      "current-a",
      "current-b",
    ]);
    expect(payload.state.activeTopicId).toBe("current-a");
    expect(payload.state.topics?.["foreign-topic"]).toBeUndefined();
  });

  it("keeps legacy payload behavior when no module topic scope is supplied", () => {
    const payload = buildReviewProgressPayload({
      subjectSlug: "sql",
      moduleSlug: "legacy-module",
      locale: "en",
      state: {
        topics: {
          legacy: {
            completed: true,
          },
        },
      },
    });

    expect(payload.moduleTopicIds).toBeUndefined();
    expect(payload.state.topics?.legacy?.completed).toBe(true);
  });

  it("serializes canonical workspace while keeping legacy aliases readable", () => {
    const workspace = makeWorkspace({});

    const payload = buildReviewProgressPayload({
      subjectSlug: "python",
      moduleSlug: "module-1",
      locale: "en",
      state: {
        topics: {
          topic: {
            runtimeStateV2: {
              exercises: {
                exercise: {
                  codeWorkspace: workspace,
                  ideWorkspace: workspace,
                  userEdited: true,
                },
              },
            },
            quizState: {
              card: {
                practiceItemPatch: {
                  exercise: {
                    codeWorkspace: workspace,
                    code: "a",
                  },
                },
              },
            },
            toolState: {
              "card:general": {
                toolWorkspace: workspace,
              },
            },
          },
        },
      } as any,
    });

    const exercise =
      (payload.state.topics as any).topic.runtimeStateV2.exercises.exercise;
    const practicePatch =
      (payload.state.topics as any).topic.quizState.card.practiceItemPatch
        .exercise;
    const toolEntry =
      (payload.state.topics as any).topic.toolState["card:general"];

    expect(exercise.workspace).toEqual(workspace);
    expect(exercise).not.toHaveProperty("codeWorkspace");
    expect(exercise).not.toHaveProperty("ideWorkspace");

    expect(practicePatch.workspace).toEqual(workspace);
    expect(practicePatch).not.toHaveProperty("codeWorkspace");
    expect(practicePatch).not.toHaveProperty("ideWorkspace");

    expect(toolEntry.toolWorkspace).toEqual(workspace);
  });


  it("removes workspace-derived scalar mirrors before serialization", () => {
    const workspace = makeWorkspace({
      nodes: [
        {
          id: "a",
          kind: "file",
          name: "a.py",
          content: "print('workspace')",
        },
      ],
      activeFileId: "a",
      openTabs: ["a"],
    });

    const payload = buildReviewProgressPayload({
      subjectSlug: "python",
      moduleSlug: "module-1",
      locale: "en",
      state: {
        topics: {
          topic: {
            quizState: {
              card: {
                answers: {},
                checkedById: {},
                practiceItemPatch: {
                  exact: {
                    workspace,
                    code: "print('workspace')",
                    source: "print('workspace')",
                    language: "python",
                    lang: "python",
                    codeLang: "python",
                    stdin: "",
                    codeStdin: "",
                    userEdited: true,
                  },
                  inconsistent: {
                    workspace,
                    code: "print('keep-me')",
                    language: "python",
                    stdin: "",
                    userEdited: true,
                  },
                },
              },
            },
          },
        },
      } as any,
    });

    const patch =
      (payload.state.topics as any).topic.quizState.card.practiceItemPatch;

    for (const key of [
      "code",
      "source",
      "language",
      "lang",
      "codeLang",
      "stdin",
      "codeStdin",
    ]) {
      expect(patch.exact).not.toHaveProperty(key);
    }

    expect(patch.exact.workspace).toEqual(workspace);
    expect(patch.inconsistent.code).toBe("print('keep-me')");
  });


  it("serializes canonical card sketch and tool state without matching runtime mirrors", () => {
    const toolWorkspace = makeWorkspace({
      nodes: [
        {
          id: "a",
          kind: "file",
          name: "query.sql",
          content: "select 1;",
        },
      ],
    });

    const exactCardKey =
      "sql:sql_module_12:section_12_1:what-update-does:sk1";
    const inconsistentCardKey =
      "sql:sql_module_12:section_12_1:what-update-does:sk2";
    const exactSketch = { kind: "sql-sketch", value: "same" };

    const payload = buildReviewProgressPayload({
      subjectSlug: "sql",
      moduleSlug: "sql_module_12",
      locale: "en",
      state: {
        topics: {
          topic: {
            runtimeStateV2: {
              cards: {
                [exactCardKey]: {
                  cardId: "sk1",
                  sketch: exactSketch,
                  toolWorkspace,
                  toolCode: "select 1;",
                  toolStdin: "",
                  toolLang: "python",
                  updatedAt: 10,
                },
                [inconsistentCardKey]: {
                  cardId: "sk2",
                  sketch: {
                    kind: "sql-sketch",
                    value: "runtime-only",
                  },
                  toolWorkspace,
                  toolCode: "select 999;",
                  toolStdin: "",
                  toolLang: "python",
                  updatedAt: 11,
                },
              },
            },
            sketchState: {
              sk1: exactSketch,
              sk2: {
                kind: "sql-sketch",
                value: "canonical",
              },
            },
            toolState: {
              [`card:${exactCardKey}`]: {
                workspace: toolWorkspace,
                code: "select 1;",
                stdin: "",
                lang: "python",
              },
              [`card:${inconsistentCardKey}`]: {
                workspace: toolWorkspace,
                code: "select 2;",
                stdin: "",
                lang: "python",
              },
            },
          },
        },
      } as any,
    });

    const topic = (payload.state.topics as any).topic;
    const exact = topic.runtimeStateV2.cards[exactCardKey];
    const inconsistent =
      topic.runtimeStateV2.cards[inconsistentCardKey];

    expect(exact).not.toHaveProperty("sketch");
    expect(exact).not.toHaveProperty("toolWorkspace");
    expect(exact).not.toHaveProperty("toolCode");
    expect(exact).not.toHaveProperty("toolStdin");
    expect(exact).not.toHaveProperty("toolLang");

    expect(topic.sketchState.sk1).toEqual(exactSketch);
    expect(topic.toolState[`card:${exactCardKey}`].workspace).toEqual(
      toolWorkspace,
    );

    expect(inconsistent.sketch).toEqual({
      kind: "sql-sketch",
      value: "runtime-only",
    });
    expect(inconsistent.toolWorkspace).toEqual(toolWorkspace);
    expect(inconsistent.toolCode).toBe("select 999;");
  });


  it("serializes scoped practice keys without exact short-key duplicates", () => {
    const scopedKey =
      "python:python-1:section-a:topic-a:q1:exercise-1";

    const canonicalPatch = {
      exerciseKey: scopedKey,
      exerciseId: "exercise-1",
      topicId: "topic-a",
      cardId: "q1",
      userEdited: true,
      updatedAt: 20,
    };

    const payload = buildReviewProgressPayload({
      subjectSlug: "python",
      moduleSlug: "python-1",
      locale: "en",
      state: {
        topics: {
          topic: {
            quizState: {
              q1: {
                answers: {},
                checkedById: {},
                practiceItemPatch: {
                  [scopedKey]: canonicalPatch,
                  "exercise-1": { ...canonicalPatch },
                  "legacy-only": {
                    exerciseKey: "legacy-only",
                    exerciseId: "legacy-only",
                    userEdited: true,
                    updatedAt: 10,
                  },
                  "legacy-different": {
                    ...canonicalPatch,
                    code: "older divergent learner state",
                  },
                },
              },
            },
          },
        },
      } as any,
    });

    const patch =
      (payload.state.topics as any).topic.quizState.q1.practiceItemPatch;

    expect(patch[scopedKey]).toEqual(canonicalPatch);
    expect(patch).not.toHaveProperty("exercise-1");
    expect(patch["legacy-only"]).toBeDefined();
    expect(patch["legacy-different"]).toBeDefined();
  });

});
