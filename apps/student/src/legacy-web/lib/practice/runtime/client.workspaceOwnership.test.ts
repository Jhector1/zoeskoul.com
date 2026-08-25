import { describe, expect, it } from "vitest";

import { resolveExerciseWorkspace } from "@zoeskoul/learning-runtime/review/module/runtime/exerciseWorkspaceResolver";
import { normalizeCurrentPracticeItem } from "./client";

function filePaths(workspace: any) {
  if (!workspace || !Array.isArray(workspace.nodes)) return [];
  const nodes = workspace.nodes as any[];
  const byId = new Map(nodes.map((node) => [String(node.id ?? ""), node]));

  const pathOf = (node: any) => {
    const names = [String(node.name ?? "")];
    let parentId = node.parentId == null ? null : String(node.parentId);
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) break;
      names.unshift(String(parent.name ?? ""));
      parentId = parent.parentId == null ? null : String(parent.parentId);
    }
    return names.filter(Boolean).join("/");
  };

  return nodes
    .filter((node) => node.kind === "file")
    .map(pathOf)
    .sort();
}

describe("normalizeCurrentPracticeItem workspace ownership", () => {
  it("preserves learner workspace on item while exercise keeps authored multi-file structure", () => {
    const authoredStarterFiles = [
      {
        path: "main.py",
        content: "from models.transaction import Transaction\n",
        language: "python",
        isEntry: true,
      },
      {
        path: "models/transaction.py",
        content: "class Transaction:\n    pass\n",
        language: "python",
      },
    ];

    const authoredWorkspace = {
      entryFilePath: "main.py",
      starterFiles: authoredStarterFiles,
      language: "python",
    };

    const canonicalExercise = {
      id: "ci-constructors-and-object-state-add-method",
      exerciseKey: "ci-constructors-and-object-state-add-method",
      kind: "code_input",
      language: "python",
      starterFiles: authoredStarterFiles,
      workspace: authoredWorkspace,
    } as any;

    const learnerWorkspace = {
      version: 2,
      language: "python",
      nodes: [
        {
          id: "file:main.py",
          kind: "file",
          name: "main.py",
          parentId: null,
          content: 'print("learner edit survives")\n',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      openTabs: ["file:main.py"],
      activeFileId: "file:main.py",
      entryFileId: "file:main.py",
      expanded: [],
      stdin: "",
    };

    const staleRuntimeExercise = {
      ...canonicalExercise,
      starterFiles: [authoredStarterFiles[0]],
      workspace: {
        entryFilePath: "main.py",
        starterFiles: [authoredStarterFiles[0]],
        language: "python",
      },
    };

    const savedItem = {
      key: "practice-item",
      exercise: staleRuntimeExercise,
      workspace: learnerWorkspace,
      codeWorkspace: learnerWorkspace,
      ideWorkspace: learnerWorkspace,
      code: 'print("learner edit survives")\n',
      source: 'print("learner edit survives")\n',
      userEdited: true,
      workspaceOrigin: "saved",
    } as any;

    const normalized = normalizeCurrentPracticeItem(
      savedItem,
      canonicalExercise,
      savedItem,
    ) as any;

    expect(normalized.workspace).toBe(learnerWorkspace);
    expect(normalized.workspace.nodes[0].content).toContain("learner edit survives");

    expect(normalized.exercise.workspace).toBe(authoredWorkspace);
    expect(normalized.exercise.starterFiles).toBe(authoredStarterFiles);

    const resolved = resolveExerciseWorkspace({
      language: "python",
      manifest: normalized.exercise,
    });

    expect(filePaths(resolved)).toEqual([
      "main.py",
      "models/transaction.py",
    ]);
  });

  it("preserves non-user live top-level workspace contract", () => {
    const liveWorkspace = {
      version: 2,
      language: "python",
      entryFileId: "file:main.py",
      activeFileId: "file:main.py",
      nodes: [
        {
          id: "file:main.py",
          kind: "file",
          name: "main.py",
          parentId: null,
          content: "print(open('data.txt').read())\n",
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: "file:data.txt",
          kind: "file",
          name: "data.txt",
          parentId: null,
          content: "fixture line\n",
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      openTabs: ["file:main.py"],
      expanded: [],
      stdin: "",
    };

    const normalized = normalizeCurrentPracticeItem(
      {
        key: "dynamic-live",
        exercise: {
          id: "dynamic-q1",
          kind: "code_input",
          language: "python",
        },
        workspaceOrigin: "starter",
      } as any,
      {
        id: "dynamic-q1",
        kind: "code_input",
        language: "python",
      } as any,
      {
        language: "python",
        workspace: liveWorkspace,
      },
    ) as any;

    expect(normalized.workspace).toBe(liveWorkspace);
    expect(normalized.exercise.workspace).toBe(liveWorkspace);
  });
});
