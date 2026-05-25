import { describe, expect, it } from "vitest";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import {
  createManifestWorkspaceDefinition,
  resolveWorkspaceForTarget,
} from "./resolveWorkspaceForTarget";

function filePaths(workspace: WorkspaceStateV2 | null) {
  if (!workspace) return [];

  const folderPathById = new Map<string, string>();

  let changed = true;
  while (changed) {
    changed = false;

    for (const node of workspace.nodes as any[]) {
      if (!node || node.kind !== "folder") continue;

      const id = String(node.id ?? "");
      if (!id || folderPathById.has(id)) continue;

      const name = String(node.name ?? "");
      const parentId = node.parentId == null ? null : String(node.parentId);
      if (parentId && !folderPathById.has(parentId)) continue;

      const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
      folderPathById.set(id, parentPath ? `${parentPath}/${name}` : name);
      changed = true;
    }
  }

  return (workspace.nodes as any[])
    .filter((node) => node?.kind === "file")
    .map((node) => {
      const name = String(node?.name ?? "");
      const parentId = node?.parentId == null ? null : String(node.parentId);
      const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
      return parentPath ? `${parentPath}/${name}` : name;
    })
    .sort((a, b) => a.localeCompare(b));
}

function fileContent(workspace: WorkspaceStateV2 | null, path: string) {
  if (!workspace) return null;

  const folderPathById = new Map<string, string>();

  let changed = true;
  while (changed) {
    changed = false;

    for (const node of workspace.nodes as any[]) {
      if (!node || node.kind !== "folder") continue;

      const id = String(node.id ?? "");
      if (!id || folderPathById.has(id)) continue;

      const name = String(node.name ?? "");
      const parentId = node.parentId == null ? null : String(node.parentId);
      if (parentId && !folderPathById.has(parentId)) continue;

      const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
      folderPathById.set(id, parentPath ? `${parentPath}/${name}` : name);
      changed = true;
    }
  }

  const file = (workspace.nodes as any[]).find((node) => {
    if (node?.kind !== "file") return false;
    const name = String(node?.name ?? "");
    const parentId = node?.parentId == null ? null : String(node.parentId);
    const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
    const nodePath = parentPath ? `${parentPath}/${name}` : name;
    return nodePath === path;
  });

  return file ? String(file.content ?? "") : null;
}

function workspaceFromResolved(
  code = "print('saved')\n",
  stdin = "",
): WorkspaceStateV2 {
  return resolveWorkspaceForTarget({
    targetKey: "exercise:a",
    targetKind: "exercise",
    language: "python",
    manifest: {
      starterCode: "# starter\n",
      workspace: {
        entryFilePath: "main.py",
        starterFiles: [
          {
            path: "main.py",
            content: "# starter\n",
            isEntry: true,
          },
        ],
      },
    },
    workspaceRequested: true,
    savedCandidates: [
      {
        workspace: undefined,
        code,
        stdin,
        userEdited: true,
        workspaceOrigin: "user",
      },
    ],
  }).workspace as WorkspaceStateV2;
}

describe("resolveWorkspaceForTarget", () => {
  it("manifest only resolves starter plus fixtures", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:file-io",
      targetKind: "exercise",
      language: "python",
      manifest: {
        starterCode: "# Write your answer below\n",
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            {
              path: "main.py",
              content: "# Write your answer below\n",
              isEntry: true,
            },
          ],
          files: [
            {
              path: "data.txt",
              content: "Hello fixture",
            },
          ],
        },
      },
      workspaceRequested: true,
    });

    expect(filePaths(resolved.workspace)).toEqual(["data.txt", "main.py"]);
    expect(fileContent(resolved.workspace, "main.py")).toBe("# Write your answer below\n");
    expect(fileContent(resolved.workspace, "data.txt")).toBe("Hello fixture");
    expect(resolved.source).toBe("manifest");
  });

  it("saved main.py keeps learner code and manifest fixture files merge in", () => {
    const savedWorkspace = workspaceFromResolved("print('saved learner')\n");

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:file-io",
      targetKind: "exercise",
      language: "python",
      manifest: {
        starterCode: "# starter\n",
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            {
              path: "main.py",
              content: "# starter\n",
              isEntry: true,
            },
          ],
          files: [
            {
              path: "data.txt",
              content: "fixture",
            },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          workspace: savedWorkspace,
          userEdited: true,
          workspaceOrigin: "user",
        },
      ],
    });

    expect(filePaths(resolved.workspace)).toEqual(["data.txt", "main.py"]);
    expect(fileContent(resolved.workspace, "main.py")).toBe("print('saved learner')\n");
    expect(fileContent(resolved.workspace, "data.txt")).toBe("fixture");
    expect(resolved.source).toBe("saved");
  });

  it("does not inject starter helper files into saved work", () => {
    const savedWorkspace = workspaceFromResolved("print('saved learner')\n");

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:helpers",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            { path: "main.py", content: "# starter\n", isEntry: true },
            { path: "helper.py", content: "def helper():\n    return 1\n" },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          workspace: savedWorkspace,
          userEdited: true,
          workspaceOrigin: "user",
        },
      ],
    });

    expect(filePaths(resolved.workspace)).toEqual(["main.py"]);
  });

  it("does inject fixture helper files into saved work when they are runtime assets", () => {
    const savedWorkspace = workspaceFromResolved("print('saved learner')\n");

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:fixture-helper",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [{ path: "main.py", content: "# starter\n", isEntry: true }],
          files: [{ path: "helper.py", content: "VALUE = 1\n" }],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          workspace: savedWorkspace,
          userEdited: true,
          workspaceOrigin: "user",
        },
      ],
    });

    expect(filePaths(resolved.workspace)).toEqual(["helper.py", "main.py"]);
    expect(fileContent(resolved.workspace, "helper.py")).toBe("VALUE = 1\n");
  });

  it("saved path collisions beat fixture files", () => {
    const savedWorkspace = resolveWorkspaceForTarget({
      targetKey: "exercise:collision",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [{ path: "main.py", content: "# starter\n", isEntry: true }],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          workspace: workspaceFromResolved("print('saved learner')\n"),
          userEdited: true,
          workspaceOrigin: "user",
        },
      ],
    }).workspace as WorkspaceStateV2;

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:collision",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [{ path: "main.py", content: "# starter\n", isEntry: true }],
          files: [{ path: "main.py", content: "fixture main\n" }],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          workspace: savedWorkspace,
          userEdited: true,
          workspaceOrigin: "user",
        },
      ],
    });

    expect(fileContent(resolved.workspace, "main.py")).toBe("print('saved learner')\n");
  });

  it("ignores solution files for learner workspace hydration", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:solution-files",
      targetKind: "exercise",
      language: "python",
      manifest: {
        starterCode: "# starter\n",
        solutionFiles: [{ path: "hidden.py", content: "print('solution')" }],
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [{ path: "main.py", content: "# starter\n", isEntry: true }],
        },
      },
      workspaceRequested: true,
    });

    expect(filePaths(resolved.workspace)).toEqual(["main.py"]);
  });

  it("returns null workspace for a card with no tool workspace request", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "card:text",
      targetKind: "card",
      language: "python",
      manifest: {},
      workspaceRequested: false,
    });

    expect(resolved.workspace).toBeNull();
    expect(resolved.source).toBe("none");
  });

  it("resolves a card tool workspace with the same resolver", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "card:sketch",
      targetKind: "card",
      language: "python",
      manifest: {
        starterCode: "print('demo')\n",
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [{ path: "main.py", content: "print('demo')\n", isEntry: true }],
        },
      },
      workspaceRequested: true,
    });

    expect(filePaths(resolved.workspace)).toEqual(["main.py"]);
    expect(fileContent(resolved.workspace, "main.py")).toBe("print('demo')\n");
  });

  it("target A saved workspace never applies to target B", () => {
    const savedWorkspace = workspaceFromResolved("print('target A')\n");

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:B",
      targetKind: "exercise",
      language: "python",
      manifest: {
        starterCode: "# starter B\n",
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [{ path: "main.py", content: "# starter B\n", isEntry: true }],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          targetKey: "exercise:A",
          workspace: savedWorkspace,
          userEdited: false,
          workspaceOrigin: "starter",
        },
      ],
    });

    expect(fileContent(resolved.workspace, "main.py")).toBe("# starter B\n");
    expect(resolved.source).toBe("manifest");
  });

  it("local draft for target A never applies to target B", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:B",
      targetKind: "exercise",
      language: "python",
      manifest: {
        starterCode: "# starter B\n",
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [{ path: "main.py", content: "# starter B\n", isEntry: true }],
          files: [{ path: "data.txt", content: "fixture B" }],
        },
      },
      workspaceRequested: true,
      localDraft: {
        targetKey: "exercise:A",
        workspace: workspaceFromResolved("print('draft A')\n"),
        savedAt: Date.now(),
      },
    });

    expect(filePaths(resolved.workspace)).toEqual(["data.txt", "main.py"]);
    expect(fileContent(resolved.workspace, "main.py")).toBe("# starter B\n");
  });
});

describe("createManifestWorkspaceDefinition", () => {
  it("keeps starter and fixture buckets distinct", () => {
    const definition = createManifestWorkspaceDefinition({
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [{ path: "main.py", content: "# starter\n", isEntry: true }],
          files: [{ path: "data.txt", content: "fixture" }],
        },
      },
      workspaceRequested: true,
    });

    expect(definition.starterFiles).toEqual([
      { path: "main.py", content: "# starter\n" },
    ]);
    expect(definition.fixtureFiles).toEqual([
      { path: "data.txt", content: "fixture" },
    ]);
  });
});
