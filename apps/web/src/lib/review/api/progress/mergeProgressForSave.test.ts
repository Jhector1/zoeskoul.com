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

    expect(merged.topics?.first?.completed).toBe(true);
    expect(merged.topics?.second?.completed).toBe(true);
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

  it("treats a newer workspace snapshot as an exact file-tree replacement", () => {
    const oldWorkspace = {
      version: 2,
      nodes: [
        { id: "main", kind: "file", content: "a much longer old value" },
        { id: "deleted", kind: "file", content: "remove me" },
      ],
      activeFileId: "main",
      entryFileId: "main",
    };
    const newWorkspace = {
      version: 2,
      nodes: [
        { id: "main", kind: "file", content: "short" },
        { id: "created", kind: "file", name: "created.py", content: "new" },
        {
          id: "renamed",
          kind: "file",
          name: "renamed.py",
          content: "renamed",
        },
      ],
      activeFileId: "created",
      entryFileId: "renamed",
    };

    const merged = mergeReviewProgressForSave({
      previousState: state({
        topics: {
          first: {
            runtimeStateV2: {
              exercises: {
                exercise: {
                  workspace: oldWorkspace,
                  userEdited: true,
                  updatedAt: 10,
                },
              },
            },
          },
        },
      }),
      incomingState: state({
        topics: {
          first: {
            runtimeStateV2: {
              exercises: {
                exercise: {
                  workspace: newWorkspace,
                  userEdited: true,
                  updatedAt: 11,
                },
              },
            },
          },
        },
      }),
      saveRevision: 12,
    });

    const saved = merged.topics?.first?.runtimeStateV2?.exercises?.exercise;
    expect(saved).toBeDefined();
    expect(saved!.workspace).toEqual(newWorkspace);
    expect(saved!.workspace.nodes).toHaveLength(3);
    expect(saved!.workspace.nodes[0].content).toBe("short");
    expect(saved!.workspace.nodes.some((node: any) => node.id === "deleted")).toBe(
      false,
    );
    expect(saved!.workspace.activeFileId).toBe("created");
    expect(saved!.workspace.entryFileId).toBe("renamed");
  });

  it("prunes foreign-module topics while preserving another current-module tab", () => {
    const merged = mergeReviewProgressForSave({
      previousState: state({
        activeTopicId: "foreign-topic",
        topics: {
          "current-a": {
            completed: true,
          },
          "current-b": {
            completed: true,
          },
          "foreign-topic": {
            completed: true,
          },
        },
      }),
      incomingState: state({
        activeTopicId: "current-a",
        topics: {
          "current-a": {
            readingDone: {
              intro: true,
            },
          },
        },
      }),
      moduleTopicIds: [
        "current-a",
        "current-b",
      ],
      saveRevision: 13,
    });

    expect(Object.keys(merged.topics ?? {}).sort()).toEqual([
      "current-a",
      "current-b",
    ]);
    expect(merged.topics?.["current-a"]?.completed).toBe(true);
    expect(merged.topics?.["current-a"]?.readingDone?.intro).toBe(true);
    expect(merged.topics?.["current-b"]?.completed).toBe(true);
    expect(merged.topics?.["foreign-topic"]).toBeUndefined();
    expect(merged.activeTopicId).toBe("current-a");
  });

  it("preserves legacy merge behavior when an old client sends no scope", () => {
    const merged = mergeReviewProgressForSave({
      previousState: state({
        topics: {
          old: {
            completed: true,
          },
        },
      }),
      incomingState: state({
        topics: {
          newer: {
            completed: true,
          },
        },
      }),
      saveRevision: 14,
    });

    expect(merged.topics?.old?.completed).toBe(true);
    expect(merged.topics?.newer?.completed).toBe(true);
  });

  it("promotes legacy workspace aliases and writes canonical workspace only", () => {
    const workspace = {
      version: 2,
      language: "python",
      nodes: [
        {
          id: "main",
          kind: "file",
          name: "main.py",
          content: "print('saved')",
        },
      ],
      openTabs: ["main"],
      activeFileId: "main",
      entryFileId: "main",
      stdin: "",
      expanded: [],
      leftPct: 40,
    };

    const merged = mergeReviewProgressForSave({
      previousState: state({
        topics: {
          first: {
            runtimeStateV2: {
              exercises: {
                exercise: {
                  codeWorkspace: workspace,
                  ideWorkspace: workspace,
                  userEdited: true,
                  updatedAt: 10,
                },
              },
            },
          },
        },
      }),
      incomingState: state({
        topics: {
          first: {
            quizState: {
              card: {
                answers: {},
                checkedById: {},
                practiceItemPatch: {
                  exercise: {
                    ideWorkspace: workspace,
                    code: "print('saved')",
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
      }),
      saveRevision: 14,
    });

    const runtimeExercise =
      merged.topics?.first?.runtimeStateV2?.exercises?.exercise as any;
    const practicePatch =
      (merged.topics?.first as any)?.quizState?.card?.practiceItemPatch
        ?.exercise;
    const toolEntry = (merged.topics?.first as any)?.toolState?.[
      "card:general"
    ];

    expect(runtimeExercise.workspace).toEqual(workspace);
    expect(runtimeExercise).not.toHaveProperty("codeWorkspace");
    expect(runtimeExercise).not.toHaveProperty("ideWorkspace");

    expect(practicePatch.workspace).toEqual(workspace);
    expect(practicePatch).not.toHaveProperty("codeWorkspace");
    expect(practicePatch).not.toHaveProperty("ideWorkspace");

    expect(toolEntry.toolWorkspace).toEqual(workspace);
  });


  it("drops flat exercise scalars only when workspace is authoritative", () => {
    const workspace = {
      version: 2,
      language: "python",
      nodes: [
        {
          id: "main",
          kind: "file",
          name: "main.py",
          content: "print('workspace')",
        },
      ],
      openTabs: ["main"],
      activeFileId: "main",
      entryFileId: "main",
      stdin: "input\n",
      expanded: [],
      leftPct: 40,
    };

    const merged = mergeReviewProgressForSave({
      previousState: state({}),
      incomingState: state({
        topics: {
          first: {
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
                    stdin: "input\n",
                    codeStdin: "input\n",
                    userEdited: true,
                  },
                  inconsistent: {
                    workspace,
                    code: "print('legacy-only')",
                    source: "print('legacy-only')",
                    language: "python",
                    stdin: "input\n",
                    userEdited: true,
                  },
                  scalarOnly: {
                    code: "print('scalar-only')",
                    source: "print('scalar-only')",
                    language: "python",
                    stdin: "",
                    userEdited: true,
                  },
                },
              },
            },
            runtimeStateV2: {
              exercises: {
                exactRuntime: {
                  workspace,
                  code: "print('workspace')",
                  source: "print('workspace')",
                  language: "python",
                  lang: "python",
                  codeLang: "python",
                  stdin: "input\n",
                  codeStdin: "input\n",
                  userEdited: true,
                  updatedAt: 20,
                },
              },
            },
          },
        },
      }),
      saveRevision: 20,
    });

    const patch =
      (merged.topics?.first as any).quizState.card.practiceItemPatch;

    expect(patch.exact.workspace).toEqual(workspace);
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

    expect(patch.inconsistent.code).toBe("print('legacy-only')");
    expect(patch.inconsistent.source).toBe("print('legacy-only')");
    expect(patch.scalarOnly.code).toBe("print('scalar-only')");

    const runtimeExercise =
      (merged.topics?.first as any).runtimeStateV2.exercises.exactRuntime;
    expect(runtimeExercise.workspace).toEqual(workspace);
    expect(runtimeExercise).not.toHaveProperty("code");
    expect(runtimeExercise).not.toHaveProperty("source");
    expect(runtimeExercise).not.toHaveProperty("language");
    expect(runtimeExercise).not.toHaveProperty("stdin");
  });


  it("trims runtime card sketch and tool mirrors only when canonical copies match", () => {
    const toolWorkspace = {
      version: 2,
      language: "sql",
      nodes: [
        {
          id: "main",
          kind: "file",
          name: "query.sql",
          content: "select 1;",
        },
      ],
      openTabs: ["main"],
      activeFileId: "main",
      entryFileId: "main",
      stdin: "",
      expanded: [],
      leftPct: 40,
    };

    const exactCardKey =
      "sql:sql_module_12:section_12_1:what-update-does:sk1";
    const inconsistentCardKey =
      "sql:sql_module_12:section_12_1:what-update-does:sk2";
    const orphanCardKey =
      "sql:sql_module_12:section_12_1:what-update-does:sk3";

    const exactSketch = { kind: "sql-sketch", value: "same" };
    const canonicalSecondSketch = {
      kind: "sql-sketch",
      value: "canonical",
    };

    const merged = mergeReviewProgressForSave({
      previousState: state({}),
      incomingState: state({
        topics: {
          first: {
            runtimeStateV2: {
              cards: {
                [exactCardKey]: {
                  cardId: "sk1",
                  sketch: exactSketch,
                  toolWorkspace,
                  toolCode: "select 1;",
                  toolStdin: "",
                  toolLang: "sql",
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
                  toolLang: "sql",
                  updatedAt: 11,
                },
                [orphanCardKey]: {
                  cardId: "sk3",
                  sketch: {
                    kind: "sql-sketch",
                    value: "orphan",
                  },
                  toolWorkspace,
                  toolCode: "select 3;",
                  toolStdin: "",
                  toolLang: "sql",
                  updatedAt: 12,
                },
              },
            },
            sketchState: {
              sk1: exactSketch,
              sk2: canonicalSecondSketch,
            },
            toolState: {
              [`card:${exactCardKey}`]: {
                workspace: toolWorkspace,
                code: "select 1;",
                stdin: "",
                lang: "sql",
              },
              [`card:${inconsistentCardKey}`]: {
                workspace: toolWorkspace,
                code: "select 2;",
                stdin: "",
                lang: "sql",
              },
            },
          },
        },
      }),
      saveRevision: 21,
    });

    const topic = merged.topics?.first as any;
    const exact = topic.runtimeStateV2.cards[exactCardKey];
    const inconsistent =
      topic.runtimeStateV2.cards[inconsistentCardKey];
    const orphan = topic.runtimeStateV2.cards[orphanCardKey];

    expect(exact).not.toHaveProperty("sketch");
    expect(exact).not.toHaveProperty("toolWorkspace");
    expect(exact).not.toHaveProperty("toolCode");
    expect(exact).not.toHaveProperty("toolStdin");
    expect(exact).not.toHaveProperty("toolLang");
    expect(exact.cardId).toBe("sk1");
    expect(exact.updatedAt).toBe(10);

    expect(topic.sketchState.sk1).toEqual(exactSketch);
    expect(topic.toolState[`card:${exactCardKey}`].workspace).toEqual(
      toolWorkspace,
    );
    expect(topic.toolState[`card:${exactCardKey}`].code).toBe(
      "select 1;",
    );

    expect(inconsistent.sketch).toEqual({
      kind: "sql-sketch",
      value: "runtime-only",
    });
    expect(inconsistent.toolWorkspace).toEqual(toolWorkspace);
    expect(inconsistent.toolCode).toBe("select 999;");

    expect(orphan.sketch).toEqual({
      kind: "sql-sketch",
      value: "orphan",
    });
    expect(orphan.toolWorkspace).toEqual(toolWorkspace);
    expect(orphan.toolCode).toBe("select 3;");
  });

});
