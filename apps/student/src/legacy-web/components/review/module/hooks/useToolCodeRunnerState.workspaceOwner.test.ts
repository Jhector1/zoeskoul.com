import { describe, expect, it } from "vitest";

import { resolveWorkspaceForToolBind } from "./useToolCodeRunnerState";

describe("resolveWorkspaceForToolBind", () => {
  it("keeps the canonical incoming multi-file workspace instead of replacing it with an older one-file save", () => {
    const savedWorkspace = {
      version: 2,
      language: "python",
      nodes: [
        {
          id: "file:main.py",
          kind: "file",
          name: "main.py",
          parentId: null,
          content: "print('learner main')\n",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      openTabs: ["file:main.py"],
      activeFileId: "file:main.py",
      entryFileId: "file:main.py",
      stdin: "",
      expanded: [],
      leftPct: 40,
    } as any;

    const incomingWorkspace = {
      ...savedWorkspace,
      nodes: [
        ...savedWorkspace.nodes,
        {
          id: "folder:models",
          kind: "folder",
          name: "models",
          parentId: null,
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: "file:models__transaction.py",
          kind: "file",
          name: "transaction.py",
          parentId: "folder:models",
          content: "class Transaction:\n    pass\n",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      expanded: ["folder:models"],
    } as any;

    const resolved = resolveWorkspaceForToolBind({
      incomingWorkspace,
      savedWorkspace,
      shouldUseSavedWorkspace: true,
    });

    expect(resolved).toBe(incomingWorkspace);
    expect(
      resolved?.nodes.some(
        (node: any) =>
          node.kind === "file" && node.name === "transaction.py",
      ),
    ).toBe(true);
  });

  it("uses saved workspace only when the canonical bind has no workspace", () => {
    const savedWorkspace = {
      version: 2,
      language: "python",
      nodes: [],
      openTabs: [],
      activeFileId: "",
      entryFileId: "",
      stdin: "",
      expanded: [],
      leftPct: 40,
    } as any;

    expect(
      resolveWorkspaceForToolBind({
        incomingWorkspace: null,
        savedWorkspace,
        shouldUseSavedWorkspace: true,
      }),
    ).toBe(savedWorkspace);
  });
});
