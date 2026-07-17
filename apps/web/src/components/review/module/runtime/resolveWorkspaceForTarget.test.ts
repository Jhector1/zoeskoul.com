import { describe, expect, it } from "vitest";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import {
  createManifestWorkspaceDefinition,
  resolveWorkspaceForExerciseTarget,
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
  it("keeps real saved user workspace even when the starter hash changed", () => {
    const oldStarter = resolveWorkspaceForTarget({
      targetKey: "exercise:regen",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            { path: "main.py", content: "# old starter\n", isEntry: true },
          ],
        },
      },
      workspaceRequested: true,
    });

    const savedWorkspace = JSON.parse(
        JSON.stringify(oldStarter.workspace),
    ) as WorkspaceStateV2;

    const main = savedWorkspace.nodes.find(
        (node) => node.kind === "file" && node.name === "main.py",
    );

    if (main && main.kind === "file") {
      main.content = "print('real learner work')\n";
    }

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:regen",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            { path: "main.py", content: "# new starter after regen\n", isEntry: true },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          workspace: savedWorkspace,
          userEdited: true,
          workspaceOrigin: "user",
          starterHash: oldStarter.starterHash,
        },
      ],
    });

    expect(resolved.source).toBe("saved");
    expect(fileContent(resolved.workspace, "main.py")).toBe(
        "print('real learner work')\n",
    );
  });

  it("does not let an old passive starter snapshot beat a new manifest starter", () => {
    const oldStarter = resolveWorkspaceForTarget({
      targetKey: "exercise:starter-regen",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            { path: "main.py", content: "# old starter\n", isEntry: true },
          ],
        },
      },
      workspaceRequested: true,
    });

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:starter-regen",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            { path: "main.py", content: "# new starter after regen\n", isEntry: true },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          workspace: oldStarter.workspace,
          userEdited: false,
          workspaceOrigin: "starter",
          starterHash: oldStarter.starterHash,
        },
      ],
    });

    expect(resolved.source).toBe("manifest");
    expect(fileContent(resolved.workspace, "main.py")).toBe(
        "# new starter after regen\n",
    );
  });

  it("keeps legacy saved code when it is not just a starter snapshot", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:legacy-real-work",
      targetKind: "exercise",
      language: "python",
      manifest: {
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            { path: "main.py", content: "# starter\n", isEntry: true },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          code: "print('legacy learner work')\n",
        },
      ],
    });

    expect(resolved.source).toBe("saved");
    expect(fileContent(resolved.workspace, "main.py")).toBe(
        "print('legacy learner work')\n",
    );
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

describe("resolveWorkspaceForExerciseTarget", () => {
  it("saved workspace beats starterFiles", () => {
    const saved = workspaceFromResolved("print('saved wins')\n");

    const resolved = resolveWorkspaceForExerciseTarget({
      targetKey: "exercise:saved-beats-starter-files",
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [
            { path: "main.py", content: "print('starter loses')\n", isEntry: true },
            { path: "helper.py", content: "VALUE = 1\n" },
          ],
        },
      },
      savedCandidates: [{ workspace: saved }],
    });

    expect(resolved.source).toBe("saved");
    expect(fileContent(resolved.workspace, "main.py")).toBe("print('saved wins')\n");
  });

  it("saved legacy code beats starterCode", () => {
    const resolved = resolveWorkspaceForExerciseTarget({
      targetKey: "exercise:legacy-code",
      language: "python",
      manifest: { starterCode: "print('starter loses')\n" },
      savedCandidates: [{ code: "print('legacy code wins')\n" }],
    });

    expect(resolved.source).toBe("saved");
    expect(fileContent(resolved.workspace, "main.py")).toBe("print('legacy code wins')\n");
  });

  it("starterFiles beats default", () => {
    const resolved = resolveWorkspaceForExerciseTarget({
      targetKey: "exercise:starter-files",
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [{ path: "main.py", content: "print('starter')\n", isEntry: true }],
        },
      },
    });

    expect(resolved.source).toBe("starter");
    expect(fileContent(resolved.workspace, "main.py")).toBe("print('starter')\n");
  });

  it("starterCode becomes main.py when no starterFiles", () => {
    const resolved = resolveWorkspaceForExerciseTarget({
      targetKey: "exercise:starter-code",
      language: "python",
      manifest: { starterCode: "print('starter code only')\n" },
    });

    expect(resolved.entryFilePath).toBe("main.py");
    expect(filePaths(resolved.workspace)).toEqual(["main.py"]);
    expect(fileContent(resolved.workspace, "main.py")).toBe("print('starter code only')\n");
  });

  it("helper files are preserved from saved workspace", () => {
    const saved = resolveWorkspaceForTarget({
      targetKey: "exercise:saved-helper",
      targetKind: "exercise",
      language: "python",
      manifest: {},
      workspaceRequested: true,
      savedCandidates: [
        {
          workspace: {
            version: 2,
            language: "python",
            nodes: [
              {
                id: "file:main.py",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "from helper import value\nprint(value())\n",
                createdAt: 0,
                updatedAt: 0,
              },
              {
                id: "file:helper.py",
                kind: "file",
                name: "helper.py",
                parentId: null,
                content: "def value():\n    return 42\n",
                createdAt: 0,
                updatedAt: 0,
              },
            ],
            openTabs: ["file:main.py", "file:helper.py"],
            activeFileId: "file:main.py",
            entryFileId: "file:main.py",
            stdin: "",
            expanded: [],
            leftPct: 26,
          },
        },
      ],
    }).workspace as WorkspaceStateV2;

    const resolved = resolveWorkspaceForExerciseTarget({
      targetKey: "exercise:saved-helper",
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [{ path: "main.py", content: "# starter\n", isEntry: true }],
        },
      },
      savedCandidates: [{ workspace: saved }],
    });

    expect(filePaths(resolved.workspace)).toEqual(["helper.py", "main.py"]);
    expect(fileContent(resolved.workspace, "helper.py")).toContain("return 42");
  });

  it("helper files are preserved from starterFiles", () => {
    const resolved = resolveWorkspaceForExerciseTarget({
      targetKey: "exercise:starter-helper",
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [
            { path: "main.py", content: "from helper import value\n", isEntry: true },
            { path: "helper.py", content: "def value():\n    return 1\n" },
          ],
        },
      },
    });

    expect(filePaths(resolved.workspace)).toEqual(["helper.py", "main.py"]);
    expect(fileContent(resolved.workspace, "helper.py")).toContain("return 1");
  });

  it("falls back to a blank starter shell when neither saved nor starter exists", () => {
    const resolved = resolveWorkspaceForExerciseTarget({
      targetKey: "exercise:default",
      language: "python",
      manifest: {},
    });

    expect(resolved.source).toBe("starter");
    expect(resolved.entryFilePath).toBe("main.py");
    expect(filePaths(resolved.workspace)).toEqual(["main.py"]);
    expect(fileContent(resolved.workspace, "main.py")).toBe("");
  });

  it("rejects blank saved user workspace when manifest has starter code", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:embedded-tryit",
      targetKind: "exercise",
      language: "python",
      manifest: {
        starterCode: "# TODO: print the required sentence\n",
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            {
              path: "main.py",
              content: "# TODO: print the required sentence\n",
              isEntry: true,
            },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          targetKey: "exercise:embedded-tryit",
          workspace: {
            version: 2,
            language: "python",
            nodes: [
              {
                id: "file:main.py",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "",
                createdAt: 0,
                updatedAt: 0,
              },
            ],
            openTabs: ["file:main.py"],
            activeFileId: "file:main.py",
            entryFileId: "file:main.py",
            stdin: "",
            expanded: [],
            leftPct: 26,
          },
          code: "",
          source: "",
          userEdited: true,
          workspaceOrigin: "saved",
        },
      ],
    });

    expect(resolved.source).toBe("manifest");
    expect(fileContent(resolved.workspace, "main.py")).toBe(
      "# TODO: print the required sentence\n",
    );
  });

  it("rejects fresh blank local draft when manifest has starter code", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:embedded-tryit-local-draft",
      targetKind: "exercise",
      language: "python",
      manifest: {
        starterCode: "# TODO: print the required sentence\n",
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            {
              path: "main.py",
              content: "# TODO: print the required sentence\n",
              isEntry: true,
            },
          ],
        },
      },
      workspaceRequested: true,
      localDraft: {
        targetKey: "exercise:embedded-tryit-local-draft",
        workspace: {
          version: 2,
          language: "python",
          nodes: [
            {
              id: "file:main.py",
              kind: "file",
              name: "main.py",
              parentId: null,
              content: "",
              createdAt: 0,
              updatedAt: 0,
            },
          ],
          openTabs: ["file:main.py"],
          activeFileId: "file:main.py",
          entryFileId: "file:main.py",
          stdin: "",
          expanded: [],
          leftPct: 26,
        },
        savedAt: Date.now(),
      },
    });

    expect(resolved.source).toBe("manifest");
    expect(fileContent(resolved.workspace, "main.py")).toBe(
      "# TODO: print the required sentence\n",
    );
  });

  it("rejects a saved SQL workspace whose first starter was copied into every file", () => {
    const schema = [
      "-- Provided setup: the products table is already defined.",
      "CREATE TABLE products (",
      "  product_id INTEGER PRIMARY KEY,",
      "  product_name TEXT NOT NULL,",
      "  price REAL",
      ");",
    ].join("\n");
    const query =
      "-- Task: verify products through sqlite_master.\n";

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:collapsed-sql-starter",
      targetKind: "exercise",
      language: "sql",
      manifest: {
        starterCode: query,
        workspace: {
          language: "sql",
          entryFilePath: "query.sql",
          starterFiles: [
            {
              path: "schema.sql",
              content: schema,
            },
            {
              path: "query.sql",
              content: query,
              isEntry: true,
            },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          targetKey: "exercise:collapsed-sql-starter",
          workspace: {
            version: 2,
            language: "sql",
            nodes: [
              {
                id: "file:schema.sql",
                kind: "file",
                name: "schema.sql",
                parentId: null,
                content: schema,
                createdAt: 0,
                updatedAt: 0,
              },
              {
                id: "file:query.sql",
                kind: "file",
                name: "query.sql",
                parentId: null,
                content: schema,
                createdAt: 0,
                updatedAt: 0,
              },
            ],
            openTabs: ["file:query.sql", "file:schema.sql"],
            activeFileId: "file:query.sql",
            entryFileId: "file:query.sql",
            stdin: "",
            expanded: [],
            leftPct: 26,
          },
          code: schema,
          source: schema,
          userEdited: true,
          workspaceOrigin: "saved",
        },
      ],
    });

    expect(resolved.source).toBe("manifest");
    expect(fileContent(resolved.workspace, "schema.sql")).toBe(schema);
    expect(fileContent(resolved.workspace, "query.sql")).toBe(query);
  });

  it("rejects the same collapsed SQL shape from a fresh local draft", () => {
    const schema =
      "CREATE TABLE orders (id INTEGER PRIMARY KEY);\n";
    const query =
      "-- Task: verify the orders table.\n";

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:collapsed-sql-local-draft",
      targetKind: "exercise",
      language: "sql",
      manifest: {
        starterCode: query,
        workspace: {
          language: "sql",
          entryFilePath: "query.sql",
          starterFiles: [
            { path: "schema.sql", content: schema },
            {
              path: "query.sql",
              content: query,
              isEntry: true,
            },
          ],
        },
      },
      workspaceRequested: true,
      localDraft: {
        targetKey: "exercise:collapsed-sql-local-draft",
        workspace: {
          version: 2,
          language: "sql",
          nodes: [
            {
              id: "file:schema.sql",
              kind: "file",
              name: "schema.sql",
              parentId: null,
              content: schema,
              createdAt: 0,
              updatedAt: 0,
            },
            {
              id: "file:query.sql",
              kind: "file",
              name: "query.sql",
              parentId: null,
              content: schema,
              createdAt: 0,
              updatedAt: 0,
            },
          ],
          openTabs: ["file:query.sql", "file:schema.sql"],
          activeFileId: "file:query.sql",
          entryFileId: "file:query.sql",
          stdin: "",
          expanded: [],
          leftPct: 26,
        },
        savedAt: Date.now(),
      },
    });

    expect(resolved.source).toBe("manifest");
    expect(fileContent(resolved.workspace, "schema.sql")).toBe(schema);
    expect(fileContent(resolved.workspace, "query.sql")).toBe(query);
  });

  it("preserves real learner edits across distinct SQL files", () => {
    const schema =
      "CREATE TABLE products (id INTEGER PRIMARY KEY);\n";
    const query =
      "-- Task: verify products.\n";
    const learnerQuery =
      "SELECT sql FROM sqlite_master WHERE name = 'products';\n";

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:real-sql-work",
      targetKind: "exercise",
      language: "sql",
      manifest: {
        starterCode: query,
        workspace: {
          language: "sql",
          entryFilePath: "query.sql",
          starterFiles: [
            { path: "schema.sql", content: schema },
            {
              path: "query.sql",
              content: query,
              isEntry: true,
            },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          targetKey: "exercise:real-sql-work",
          workspace: {
            version: 2,
            language: "sql",
            nodes: [
              {
                id: "file:schema.sql",
                kind: "file",
                name: "schema.sql",
                parentId: null,
                content: schema,
                createdAt: 0,
                updatedAt: 0,
              },
              {
                id: "file:query.sql",
                kind: "file",
                name: "query.sql",
                parentId: null,
                content: learnerQuery,
                createdAt: 0,
                updatedAt: 0,
              },
            ],
            openTabs: ["file:query.sql", "file:schema.sql"],
            activeFileId: "file:query.sql",
            entryFileId: "file:query.sql",
            stdin: "",
            expanded: [],
            leftPct: 26,
          },
          code: learnerQuery,
          source: learnerQuery,
          userEdited: true,
          workspaceOrigin: "user",
        },
      ],
    });

    expect(resolved.source).toBe("saved");
    expect(fileContent(resolved.workspace, "schema.sql")).toBe(schema);
    expect(fileContent(resolved.workspace, "query.sql")).toBe(
      learnerQuery,
    );
  });

  it("rejects saved unresolved i18n alias workspace when manifest has resolved starter code", () => {
    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:embedded-tryit-i18n",
      targetKind: "exercise",
      language: "python",
      manifest: {
        starterCode: "# TODO: print the required sentence\n",
        workspace: {
          entryFilePath: "main.py",
          starterFiles: [
            {
              path: "main.py",
              content: "# TODO: print the required sentence\n",
              isEntry: true,
            },
          ],
        },
      },
      workspaceRequested: true,
      savedCandidates: [
        {
          targetKey: "exercise:embedded-tryit-i18n",
          workspace: {
            version: 2,
            language: "python",
            nodes: [
              {
                id: "file:main.py",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "@:topics.python-v2.example.quiz.demo.starterCode",
                createdAt: 0,
                updatedAt: 0,
              },
            ],
            openTabs: ["file:main.py"],
            activeFileId: "file:main.py",
            entryFileId: "file:main.py",
            stdin: "",
            expanded: [],
            leftPct: 26,
          },
          code: "@:topics.python-v2.example.quiz.demo.starterCode",
          source: "@:topics.python-v2.example.quiz.demo.starterCode",
          userEdited: true,
          workspaceOrigin: "saved",
        },
      ],
    });

    expect(resolved.source).toBe("manifest");
    expect(fileContent(resolved.workspace, "main.py")).toBe(
      "# TODO: print the required sentence\n",
    );
  });


  it("hydrates sql entry file from resolved registry starter files when raw manifest still has @: aliases", () => {
    const resolvedSqlStarter = [
      "-- Return only the name column from the products table.",
      "SELECT ",
      "FROM products;",
      "",
    ].join("\n");

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:sql-v2-query-one-column",
      targetKind: "exercise",
      language: "sql",
      manifest: {
        language: "sql",
        starterCode:
          "@:topics.sql-v2.sql-v2-1.query_one_column.quiz.ci_select_name_from_products.starterCode",
        starterFiles: [
          {
            path: "query.sql",
            content:
              "@:topics.sql-v2.sql-v2-1.query_one_column.quiz.ci_select_name_from_products.starterCode",
            isEntry: true,
          },
        ],
        workspace: {
          language: "sql",
          entryFilePath: "query.sql",
          starterFiles: [
            {
              path: "query.sql",
              content:
                "@:topics.sql-v2.sql-v2-1.query_one_column.quiz.ci_select_name_from_products.starterCode",
              isEntry: true,
            },
          ],
        },
      },
      entry: {
        language: "sql",
        starterCode: resolvedSqlStarter,
        starterFiles: [
          {
            path: "query.sql",
            content: resolvedSqlStarter,
            isEntry: true,
          },
        ],
      },
      workspaceRequested: true,
    });

    expect(resolved.source).toBe("manifest");
    expect(filePaths(resolved.workspace)).toEqual(["query.sql"]);
    expect(fileContent(resolved.workspace, "query.sql")).toBe(resolvedSqlStarter);
  });

  it("uses resolved sql starterCode to fill a blank query.sql placeholder", () => {
    const registrySqlStarter = [
      "-- starter from registry",
      "SELECT *",
      "FROM products;",
      "",
    ].join("\n");

    const resolved = resolveWorkspaceForTarget({
      targetKey: "exercise:sql-v2-starter-code-only",
      targetKind: "exercise",
      language: "sql",
      manifest: {
        language: "sql",
        workspace: {
          language: "sql",
          entryFilePath: "query.sql",
          starterFiles: [
            {
              path: "query.sql",
              content: "@:topics.sql-v2.demo.quiz.step.starterCode",
              isEntry: true,
            },
          ],
        },
      },
      entry: {
        language: "sql",
        starterCode: registrySqlStarter,
      },
      workspaceRequested: true,
    });

    expect(filePaths(resolved.workspace)).toEqual(["query.sql"]);
    expect(fileContent(resolved.workspace, "query.sql")).toBe(registrySqlStarter);
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
