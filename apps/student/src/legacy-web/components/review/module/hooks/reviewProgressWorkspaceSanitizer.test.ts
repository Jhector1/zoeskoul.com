import { describe, expect, it } from "vitest";

import {
  sanitizeReviewProgressWorkspaceReferences,
} from "./reviewProgressWorkspaceSanitizer";

function poisonedWorkspace() {
  return {
    version: 2,
    language: "sql",
    nodes: [
      {
        id: "file:operations.sql",
        kind: "file",
        name: "operations.sql",
        parentId: null,
        content: "UPDATE inventory_items SET price = 8.25 WHERE id = 2;",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "file:query.sql",
        kind: "file",
        name: "query.sql",
        parentId: null,
        content: "SELECT * FROM inventory_items ORDER BY id;",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "folder:notes",
        kind: "folder",
        name: "notes",
        parentId: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    openTabs: ["file:query.sql", "folder:notes", "stale"],
    activeFileId: "folder:notes",
    entryFileId: "stale",
    stdin: "",
    expanded: ["folder:notes", "missing"],
    leftPct: 40,
  };
}

describe("review progress workspace sanitizer", () => {
  it("repairs every persisted workspace alias without touching learner SQL", () => {
    const poisoned = poisonedWorkspace();
    const progress = {
      topics: {
        "module-1-inventory-correction-cleanup": {
          runtimeStateV2: {
            exercises: {
              step1: {
                workspace: poisoned,
                codeWorkspace: { ...poisoned },
                ideWorkspace: { ...poisoned },
                code:
                  "SELECT * FROM inventory_items ORDER BY id;",
              },
            },
          },
        },
      },
    };

    const sanitized =
      sanitizeReviewProgressWorkspaceReferences(progress);

    const exercise =
      sanitized.topics["module-1-inventory-correction-cleanup"]
        .runtimeStateV2.exercises.step1;

    for (const workspace of [
      exercise.workspace,
      exercise.codeWorkspace,
      exercise.ideWorkspace,
    ]) {
      expect(workspace.openTabs).toEqual(["file:query.sql"]);
      expect(workspace.activeFileId).toBe("file:query.sql");
      expect(workspace.entryFileId).toBe("file:query.sql");
      expect(workspace.expanded).toEqual(["folder:notes"]);
      expect(workspace.nodes[0].content).toContain(
        "SET price = 8.25",
      );
    }

    expect(exercise.code).toBe(
      "SELECT * FROM inventory_items ORDER BY id;",
    );
  });

  it("does not clone a progress tree whose workspaces are already valid", () => {
    const valid = poisonedWorkspace();
    valid.openTabs = ["file:query.sql"];
    valid.activeFileId = "file:query.sql";
    valid.entryFileId = "file:query.sql";
    valid.expanded = ["folder:notes"];

    const progress = { topics: { topic: { workspace: valid } } };
    expect(
      sanitizeReviewProgressWorkspaceReferences(progress),
    ).toBe(progress);
  });
});
