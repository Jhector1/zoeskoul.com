import { describe, expect, it } from "vitest";

import {
  normalizeWorkspaceViewReferences,
  preserveLocalWorkspaceNavigation,
} from "./index";

function workspace(overrides: Record<string, unknown> = {}) {
  return {
    version: 2 as const,
    language: "sql" as const,
    nodes: [
      {
        id: "file:operations.sql",
        kind: "file" as const,
        name: "operations.sql",
        parentId: null,
        content: "UPDATE inventory_items SET status = 'active';",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "file:query.sql",
        kind: "file" as const,
        name: "query.sql",
        parentId: null,
        content: "SELECT * FROM inventory_items;",
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: "folder:notes",
        kind: "folder" as const,
        name: "notes",
        parentId: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    openTabs: ["file:query.sql"],
    activeFileId: "file:query.sql",
    entryFileId: "file:query.sql",
    stdin: "",
    expanded: ["folder:notes"],
    leftPct: 40,
    ...overrides,
  };
}

describe("workspace view-reference normalization", () => {
  it("removes stale and non-file openTabs and repairs active/entry ids", () => {
    const source = workspace({
      openTabs: [
        "file:query.sql",
        "folder:notes",
        "missing",
        "file:query.sql",
      ],
      activeFileId: "folder:notes",
      entryFileId: "missing",
      expanded: ["folder:notes", "missing"],
    });

    const normalized = normalizeWorkspaceViewReferences(source);

    expect(normalized.openTabs).toEqual(["file:query.sql"]);
    expect(normalized.activeFileId).toBe("file:query.sql");
    expect(normalized.entryFileId).toBe("file:query.sql");
    expect(normalized.expanded).toEqual(["folder:notes"]);
    expect(
      normalized.nodes.find((node) => node.id === "file:operations.sql"),
    ).toMatchObject({
      content: "UPDATE inventory_items SET status = 'active';",
    });
  });

  it("preserves valid local tabs but rejects stale/folder ids during merge", () => {
    const incoming = workspace({
      openTabs: ["file:query.sql"],
      activeFileId: "file:query.sql",
    });
    const local = workspace({
      openTabs: [
        "file:operations.sql",
        "folder:notes",
        "stale",
      ],
      activeFileId: "folder:notes",
      expanded: ["folder:notes", "stale"],
    });

    const merged = preserveLocalWorkspaceNavigation(incoming, local);

    expect(new Set(merged.openTabs)).toEqual(
      new Set([
        "file:query.sql",
        "file:operations.sql",
      ]),
    );
    expect(merged.openTabs).not.toContain("folder:notes");
    expect(merged.openTabs).not.toContain("stale");
    expect(merged.activeFileId).toBe("file:query.sql");
    expect(merged.expanded).toEqual(["folder:notes"]);
  });


  it("uses the first file only when no valid open tab survives", () => {
    const source = workspace({
      openTabs: ["folder:notes", "missing"],
      activeFileId: "folder:notes",
      entryFileId: "missing",
    });

    const normalized = normalizeWorkspaceViewReferences(source);

    expect(normalized.activeFileId).toBe("file:operations.sql");
    expect(normalized.entryFileId).toBe("file:operations.sql");
    expect(normalized.openTabs).toEqual(["file:operations.sql"]);
  });

  it("keeps an already-valid workspace by reference", () => {
    const source = workspace();
    expect(normalizeWorkspaceViewReferences(source)).toBe(source);
  });
});
