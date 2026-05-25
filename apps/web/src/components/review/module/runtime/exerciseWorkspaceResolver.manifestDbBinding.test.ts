import { describe, expect, it } from "vitest";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import {buildReviewTargetRegistry, ReviewTargetEntry} from "./reviewTargetRegistry";
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

function activeFileName(workspace: WorkspaceStateV2) {
  const node = workspace.nodes.find(
    (candidate) =>
      candidate.kind === "file" && candidate.id === workspace.activeFileId,
  );
  return node && node.kind === "file" ? node.name : null;
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

  it("merges manifest starterFiles with fixture files from workspace.files", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [
            { path: "main.py", content: "print('manifest starter')\n", entry: true },
          ],
          files: [
            { path: "data.txt", content: "alpha\nbeta\n" },
          ],
        },
      },
      entry: entry(),
    });

    expect(fileContent(workspace, "main.py")).toBe("print('manifest starter')\n");
    expect(fileContent(workspace, "data.txt")).toBe("alpha\nbeta\n");
    expect(deriveEntryCode(workspace)).toBe("print('manifest starter')\n");
  });

  it("keeps starterCode as main.py when workspace.files only provides fixtures", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterCode: "print('from starter code')\n",
          files: [
            { path: "data.txt", content: "alpha\nbeta\n" },
          ],
        },
      },
      entry: entry(),
    });

    expect(fileContent(workspace, "main.py")).toBe("print('from starter code')\n");
    expect(fileContent(workspace, "data.txt")).toBe("alpha\nbeta\n");
    expect(activeFileName(workspace)).toBe("main.py");
    expect(deriveEntryCode(workspace)).toBe("print('from starter code')\n");
  });

  it("does not let workspace.files alone make a fixture file the active entry", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          files: [
            { path: "data.txt", content: "fixture only\n" },
          ],
        },
      },
      entry: entry(),
    });

    expect(fileContent(workspace, "data.txt")).toBe("fixture only\n");
    expect(fileContent(workspace, "main.py")).toBe("");
    expect(activeFileName(workspace)).toBe("main.py");
    expect(deriveEntryCode(workspace)).toBe("");
  });

  it("keeps the first main.py when duplicate paths appear in later file sources", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [
            { path: "main.py", content: "print('starter wins')\n", entry: true },
          ],
          files: [
            { path: "main.py", content: "print('fixture should lose')\n" },
            { path: "data.txt", content: "fixture data\n" },
          ],
        },
      },
      entry: entry({
        starterFiles: [
          { path: "main.py", content: "print('entry should also lose')\n", entry: true },
          { path: "notes.txt", content: "from entry source\n" },
        ],
      }),
    });

    expect(fileContent(workspace, "main.py")).toBe("print('starter wins')\n");
    expect(
      workspace.nodes.filter(
        (node) => node.kind === "file" && node.name === "main.py",
      ),
    ).toHaveLength(1);
    expect(fileContent(workspace, "data.txt")).toBe("fixture data\n");
    expect(fileContent(workspace, "notes.txt")).toBe("from entry source\n");
  });

  it("keeps the code file active when non-code fixture files are present", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [
            { path: "main.py", content: "print('run me')\n", entry: true },
          ],
          files: [
            { path: "data.txt", content: "42\n" },
          ],
        },
      },
      entry: entry(),
    });

    expect(activeFileName(workspace)).toBe("main.py");
    expect(deriveEntryCode(workspace)).toBe("print('run me')\n");
  });

  it("does not let manifest recipe fixture files influence the entry file", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterCode: "print('recipe fixtures should not become entry')\n",
        },
        recipe: {
          files: [
            { path: "names.txt", content: "Ada\nGrace\n" },
          ],
        },
      },
      entry: entry(),
    });

    expect(fileContent(workspace, "main.py")).toBe(
      "print('recipe fixtures should not become entry')\n",
    );
    expect(fileContent(workspace, "names.txt")).toBe("Ada\nGrace\n");
    expect(activeFileName(workspace)).toBe("main.py");
    expect(deriveEntryCode(workspace)).toBe(
      "print('recipe fixtures should not become entry')\n",
    );
  });

  it("keeps single-file python exercises as a one-file workspace", () => {
    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        workspace: {
          starterFiles: [
            { path: "main.py", content: "print('single file')\n", entry: true },
          ],
        },
      },
      entry: entry(),
    });

    expect(
      workspace.nodes.filter((node) => node.kind === "file").map((node) => node.name),
    ).toEqual(["main.py"]);
    expect(deriveEntryCode(workspace)).toBe("print('single file')\n");
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


describe("review runtime starter content contract", () => {
  it.each([
    { language: "python" as const, fileName: "main.py" },
    { language: "sql" as const, fileName: "query.sql" },
  ])(
      "treats i18n alias starterCode as missing for $language",
      ({ language, fileName }) => {
        const workspace = resolveExerciseWorkspace({
          language,
          manifest: {
            workspace: {
              starterCode: "@:quiz.m1_s01_show_all_products.starterCode",
            },
          },
          entry: entry({
            language,
            starterCode: "@:quiz.m1_s01_show_all_products.starterCode",
          }),
        });

        expect(fileContent(workspace, fileName)).toBe("");
        expect(deriveEntryCode(workspace)).toBe("");
        expect(JSON.stringify(workspace)).not.toContain("@:");
        expect(JSON.stringify(workspace)).not.toContain("starterCode");
      },
  );
  it.each([
    {
      language: "python" as const,
      fileName: "main.py",
      code: "# Affiche un message\nprint('Bonjour')\n",
    },
    {
      language: "sql" as const,
      fileName: "query.sql",
      code: "-- Affiche tous les produits\nSELECT * FROM products;\n",
    },
  ])(
      "allows resolved localized starter comments for $language",
      ({ language, fileName, code }) => {
        const workspace = resolveExerciseWorkspace({
          language,
          manifest: {
            workspace: {
              starterCode: code,
            },
          },
          entry: entry({
            language,
            starterCode: code,
          }),
        });

        expect(fileContent(workspace, fileName)).toBe(code);
        expect(deriveEntryCode(workspace)).toBe(code);
        expect(JSON.stringify(workspace)).not.toContain("@:");
      },
  );
  it.each([
    { language: "python" as const, fileName: "main.py" },
    { language: "sql" as const, fileName: "query.sql" },
  ])(
      "uses a blank default workspace for $language when no saved work and no starter exist",
      ({ language, fileName }) => {
        const workspace = resolveExerciseWorkspace({
          language,
          manifest: {},
          entry: entry({
            language,
            starterCode: undefined,
            starterFiles: undefined,
          }),
        });

        expect(fileContent(workspace, fileName)).toBe("");
        expect(deriveEntryCode(workspace)).toBe("");
        expect(workspace.language).toBe(language);
      },
  );

  it.each([
    { language: "python" as const },
    { language: "sql" as const },
  ])(
      "does not mark i18n alias starterCode as starter-backed for $language",
      ({ language }) => {
        const source = resolveDeterministicEditorSource(
            entry({
              language,
              toolManifest: {
                workspace: {
                  starterCode: "@:quiz.some_runtime_key.starterCode",
                },
              },
              starterCode: "@:quiz.some_runtime_key.starterCode",
            }),
        );

        expect(source?.workspaceSeedMode).toBe("empty");
      },
  );

  it("still lets SQL keep dataset metadata separate from blank starter code", () => {
    const workspace = resolveExerciseWorkspace({
      language: "sql",
      manifest: {
        runtime: { datasetId: "sql_module_1" },
        workspace: {
          entryFile: "query.sql",
          starterCode: "@:quiz.m1_s01_show_all_products.starterCode",
        },
      },
      entry: entry({
        language: "sql",
        sqlDatasetId: "sql_module_1",
        starterCode: "@:quiz.m1_s01_show_all_products.starterCode",
      }),
    });

    expect(fileContent(workspace, "query.sql")).toBe("");
    expect(workspace.language).toBe("sql");
  });


  it("merges missing manifest fixture files into an existing saved user workspace", () => {
    const saved = resolveExerciseWorkspace({
      language: "python",
      manifest: {
        starterFiles: [
          {
            path: "main.py",
            content: "# starter",
            isEntry: true,
          },
        ],
      },
    });

    const savedMain = saved.nodes.find(
        (node) => node.kind === "file" && node.name === "main.py",
    );

    expect(savedMain).toBeTruthy();

    if (savedMain?.kind === "file") {
      savedMain.content =
          "with open('data.txt', 'r') as file:\n    content = file.read()\n    print(content)\n";
    }

    const resolved = resolveExerciseWorkspace({
      language: "python",
      saved,
      manifest: {
        workspace: {
          language: "python",
          entryFile: "main.py",
          starterFiles: [
            {
              path: "main.py",
              content: "# starter",
              isEntry: true,
            },
          ],
          files: [
            {
              path: "data.txt",
              content: "Hello, World!\nThis is a test file.",
            },
          ],
        },
      },
    });

    const mainFile = resolved.nodes.find(
        (node) => node.kind === "file" && node.name === "main.py",
    );

    const dataFile = resolved.nodes.find(
        (node) => node.kind === "file" && node.name === "data.txt",
    );

    expect(mainFile).toBeTruthy();
    expect(dataFile).toBeTruthy();

    if (mainFile?.kind === "file") {
      expect(mainFile.content).toContain("with open('data.txt'");
    }

    if (dataFile?.kind === "file") {
      expect(dataFile.content).toBe("Hello, World!\nThis is a test file.");
    }
  });



  it("keeps project step top-level fixture files available through the registry workspace manifest", () => {
    const registry = buildReviewTargetRegistry({
      subjectSlug: "python",
      moduleSlug: "e2e-review-clone",
      mod: {
        id: "e2e-review-clone",
        title: "E2E",
        sections: [
          {
            id: "section",
            slug: "section",
            title: "Section",
            topics: [
              {
                id: "topic",
                label: "Topic",
                cards: [
                  {
                    type: "project",
                    id: "project-a",
                    title: "Project A",
                    passScore: 1,
                    spec: {
                      mode: "project",
                      subject: "python",
                      steps: [
                        {
                          id: "file-io",
                          title: "File IO",
                          exerciseKey: "file-io",
                          starterFiles: {
                            "main.py": "# Write your answer below\n",
                          },
                          files: [
                            {
                              path: "data.txt",
                              content: "Hello, World!\nThis is a test file.",
                              readOnly: true,
                            },
                          ],
                        },
                      ],
                    },
                  },
                ],
                meta: {},
              },
            ],
          },
        ],
        topics: [],
      } as any,
    });

    const entry = Object.values(registry.byKey).find(
        (candidate) => candidate.targetKind === "exercise",
    );

    expect(entry).toBeTruthy();
    expect((entry?.item?.workspace as any)?.files).toEqual([
      {
        path: "data.txt",
        content: "Hello, World!\nThis is a test file.",
        readOnly: true,
      },
    ]);

    const workspace = resolveExerciseWorkspace({
      language: "python",
      manifest: entry?.item,
      entry,
    });

    const dataFile = workspace.nodes.find(
        (node) => node.kind === "file" && node.name === "data.txt",
    );

    expect(dataFile).toBeTruthy();

    if (dataFile?.kind === "file") {
      expect(dataFile.content).toBe("Hello, World!\nThis is a test file.");
    }
  });

});
