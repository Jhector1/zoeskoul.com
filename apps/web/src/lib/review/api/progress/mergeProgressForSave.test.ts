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
});
