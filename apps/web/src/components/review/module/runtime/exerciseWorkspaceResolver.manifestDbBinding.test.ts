import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { ReviewTargetEntry } from "./reviewTargetRegistry";
import {
  deriveEntryCode,
  resolveExerciseWorkspace,
} from "./exerciseWorkspaceResolver";
import { resolveDeterministicEditorSource } from "./deterministicEditorSource";

function fileContent(workspace: WorkspaceStateV2, fileName: string) {
  const node = workspace.nodes.find(
    (candidate) => candidate.kind === "file" && candidate.name === fileName,
  );
  return node && node.kind === "file" ? node.content : null;
}

function savedWorkspace(content = "print('db saved user work')\n"): WorkspaceStateV2 {
  return {
    version: 2,
    language: "python",
    nodes: [
      {
        id: "file:main.py",
        kind: "file",
        name: "main.py",
        parentId: null,
        content,
        createdAt: 10,
        updatedAt: 20,
      },
    ],
    openTabs: ["file:main.py"],
    activeFileId: "file:main.py",
    entryFileId: "file:main.py",
    stdin: "saved stdin\n",
    expanded: [],
    leftPct: 40,
  };
}

function entry(overrides: Partial<ReviewTargetEntry> = {}): ReviewTargetEntry {
  return {
    targetKey: "python:module-1:section-1:topic-1:q1",
    routeKey: "section-1/topic-1/exercise/q1",
    targetKind: "exercise",
    sectionSlug: "section-1",
    topicId: "topic-1",
    topicSlug: "topic-1",
    cardId: "q1",
    cardType: "practice",
    targetSlug: "q1",
    ownerKind: "exercise",
    ownerKey: "python:module-1:section-1:topic-1:q1",
    cardKey: "q1",
    toolScopeKey: "exercise:python:module-1:section-1:topic-1:q1",
    exerciseId: "q1",
    exerciseStateKey: "python:module-1:section-1:topic-1:q1",
    language: "python",
    item: {},
    ...overrides,
  } as ReviewTargetEntry;
}

describe("review exercise workspace manifest/db binding", () => {
  it("lets saved DB/user workspace win over manifest starterCode", () => {
    const saved = savedWorkspace();

    const workspace = resolveExerciseWorkspace({
      language: "python",
      saved,
      manifest: {
        workspace: {
          starterCode: "print('manifest starter should not win')\n",
        },
      },
      entry: entry({
        starterCode: "print('registry starter should not win')\n",
      }),
    });

    expect(workspace).toEqual(saved);
    expect(deriveEntryCode(workspace)).toBe("print('db saved user work')\n");
  });

  it("lets saved DB/user workspace win over manifest starterFiles", () => {
    const saved = savedWorkspace("print('saved multi-file state wins')\n");

    const workspace = resolveExerciseWorkspace({
      language: "python",
      saved,
      manifest: {
        workspace: {
          starterFiles: [
            { path: "main.py", content: "print('manifest main')\n", entry: true },
            { path: "helper.py", content: "print('manifest helper')\n" },
          ],
        },
      },
      entry: entry(),
    });

    expect(workspace).toEqual(saved);
    expect(deriveEntryCode(workspace)).toBe("print('saved multi-file state wins')\n");
    expect(fileContent(workspace, "helper.py")).toBeNull();
  });

  it("lets saved DB/user workspace win over a full manifest workspace object", () => {
    const saved = savedWorkspace("print('db workspace')\n");
    const manifestWorkspace = savedWorkspace("print('manifest workspace')\n");

    const workspace = resolveExerciseWorkspace({
      language: "python",
      saved,
      manifest: {
        workspace: manifestWorkspace,
      },
      entry: entry(),
    });

    expect(workspace).toEqual(saved);
    expect(deriveEntryCode(workspace)).toBe("print('db workspace')\n");
  });

  it("ignores empty manifest starterFiles object and falls back to registry/db entry starterFiles", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        starterFiles: {},
      },
      entry: entry({
        starterFiles: [
          { path: "src/main.py", content: "print('entry starter')\n", entry: true },
          { path: "src/helper.py", content: "def helper():\n    return 42\n" },
        ],
      }),
    });

    expect(fileContent(workspace, "main.py")).toBe("print('entry starter')\n");
    expect(fileContent(workspace, "helper.py")).toBe("def helper():\n    return 42\n");
    expect(deriveEntryCode(workspace)).toBe("print('entry starter')\n");
  });

  it("ignores empty manifest starterFiles array and falls back to registry/db entry starterFiles", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [],
        },
      },
      entry: entry({
        starterFiles: [
          { path: "main.py", content: "print('entry starter after empty array')\n", entry: true },
        ],
      }),
    });

    expect(fileContent(workspace, "main.py")).toBe(
      "print('entry starter after empty array')\n",
    );
    expect(deriveEntryCode(workspace)).toBe(
      "print('entry starter after empty array')\n",
    );
  });

  it("ignores blank manifest starterCode and falls back to registry/db entry starterCode", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterCode: "   ",
        },
      },
      entry: entry({
        starterCode: "print('entry starter code')\n",
      }),
    });

    expect(deriveEntryCode(workspace)).toBe("print('entry starter code')\n");
  });

  it("does not mark whitespace-only entry starterCode as a starter-backed deterministic source", () => {
    const source = resolveDeterministicEditorSource(
      entry({
        toolManifest: {},
        starterCode: "   ",
      }),
    );

    expect(source?.workspaceSeedMode).toBe("empty");
  });

  it("does not mark empty manifest starter containers as starter-backed deterministic sources", () => {
    const source = resolveDeterministicEditorSource(
      entry({
        toolManifest: {
          workspace: {
            starterFiles: {},
            initialFiles: [],
            workspaceFiles: {},
            starterCode: "",
          },
          starterFiles: {},
          initialFiles: [],
          workspaceFiles: {},
          recipe: {
            starterFiles: {},
            initialFiles: [],
            starterCode: "",
          },
        },
      }),
    );

    expect(source?.workspaceSeedMode).toBe("empty");
  });

  it("uses real manifest starterFiles when they are non-empty", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterFiles: {
            "main.py": "print('manifest starter')\n",
          },
        },
      },
      entry: entry({
        starterFiles: [
          { path: "main.py", content: "print('entry starter should lose')\n", entry: true },
        ],
      }),
    });

    expect(deriveEntryCode(workspace)).toBe("print('manifest starter')\n");
  });
  it("does not let a blank saved DB workspace hide the Reading Error Messages second-line starter", () => {
    const blankSaved = savedWorkspace("");

    const workspace = resolveExerciseWorkspace({
      language: "python",
      saved: blankSaved,
      manifest: {
        workspace: {
          starterCode: 'print("Start")\nprint("Done"\n',
        },
      },
      entry: entry({
        exerciseId: "reading-error-messages_ci-fix-second-line-error",
        starterCode: 'print("Start")\nprint("Done"\n',
      }),
    });

    expect(fileContent(workspace, "main.py")?.trimEnd()).toBe(
        'print("Start")\nprint("Done"',
    );

    expect(deriveEntryCode(workspace)?.trimEnd()).toBe(
        'print("Start")\nprint("Done"',
    );
  });

  it("uses a valid manifest workspace object only when there is no saved DB/user workspace", () => {
    const manifestWorkspace = savedWorkspace("print('manifest workspace only')\n");

    const workspace = resolveExerciseWorkspace({
      language: "python",
      saved: null,
      manifest: {
        workspace: manifestWorkspace,
      },
      entry: entry(),
    });

    expect(workspace).toEqual(manifestWorkspace);
    expect(deriveEntryCode(workspace)).toBe("print('manifest workspace only')\n");
  });
});
