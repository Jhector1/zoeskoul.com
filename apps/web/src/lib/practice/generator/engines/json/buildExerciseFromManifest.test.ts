import { describe, expect, it, vi } from "vitest";

vi.mock("@zoeskoul-code-input-expected", () => ({
  buildFixedTestsExpected: vi.fn((recipe: any) => ({
    kind: "programming",
    language: "python",
    recipeType: "fixed_tests",
    tests: recipe?.tests ?? [],
  })),
}));

import { buildExerciseFromManifest } from "./buildExerciseFromManifest";
import { resolveFullIDEConfigFromLearningIde } from "@/lib/ide/learningIdeConfig";

vi.mock("./i18nResolve", () => ({
  resolveChoicesByCount: vi.fn(),
  resolveHelp: vi.fn(() => undefined),
  resolveOptionsByIds: vi.fn(),
  resolveTokensByIds: vi.fn(),
  t: vi.fn((key: string) => {
    if (key.endsWith(".title")) return "Exercise title";
    if (key.endsWith(".prompt")) return "Exercise prompt";
    if (key.endsWith(".starterCode")) return "print('localized starter')\n";
    return key;
  }),
}));

function makeArgs() {
  return {
    rng: {} as any,
    diff: "easy" as const,
    id: "exercise-1",
    topic: "python.file-io",
    ctx: {} as any,
  };
}

function makeCodeInputDef(overrides: Record<string, unknown> = {}) {
  return {
    id: "file-io-1",
    kind: "code_input",
    messageBase: "quiz.file_io_1",
    language: "python",
    starterCode: "print('starter')\n",
    recipe: {
      type: "fixed_tests",
      tests: [
        {
          stdout: "ok\n",
        },
      ],
    },
    ...overrides,
  } as any;
}

const LINUX_COURSE1_TERMINAL_FIXTURE = {
  id: "linux-course-1-terminal-lab",
  kind: "code_input",
  messageBase: "quiz.linux_course_1_terminal_lab",
  language: "bash",
  recipe: {
    type: "shell_task",
    mode: "terminal_workspace",
  },
  workspace: {
    entryFile: "README.md",
    starterFiles: [
      {
        path: "README.md",
        content: "Use the terminal to create linux-lab/notes/today.txt",
      },
    ],
  },
  workspaceExpectations: {
    requiredFolders: [
      "linux-lab",
      "linux-lab/notes",
    ],
    requiredFiles: [
      "linux-lab/notes/today.txt",
    ],
  },
  terminalExpectations: {
    requiredCommands: [
      {
        pattern: "^pwd$",
        message: "Run pwd.",
      },
    ],
    outputContains: ["/workspace"],
    cwdEndsWith: "linux-lab",
  },
} as const;

describe("buildExerciseFromManifest runtime IDE mapping", () => {
  it("maps runtimeDefaults.supportsFileSystem to ideConfig.requires.files", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef(),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsFileSystem: true,
          supportsTerminal: false,
        },
      } as any,
    );

    expect(result.exercise.kind).toBe("code_input");
    expect((result.exercise as any).ideConfig).toMatchObject({
      requires: {
        files: true,
        multiFile: false,
        terminal: false,
      },
    });
  });

  it("maps runtimeDefaults.supportsMultiFile to ideConfig.requires.multiFile", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef(),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsMultiFile: true,
          supportsTerminal: false,
        },
      } as any,
    );

    expect((result.exercise as any).ideConfig).toMatchObject({
      requires: {
        files: true,
        multiFile: true,
        terminal: false,
      },
    });
  });
  it("keeps solutionFiles in the secret expected payload without exposing them on the public exercise", () => {
    const solutionFiles = [
      {
        path: "main.py",
        content: "from tools.helper import value\nprint(value())\n",
        language: "python",
        isEntry: true,
        entry: true,
      },
      {
        path: "tools/helper.py",
        content: "def value():\n    return 'ok'\n",
        language: "python",
      },
    ];

    const result = buildExerciseFromManifest(
        makeCodeInputDef({
          recipe: {
            type: "fixed_tests",
            tests: [{ stdout: "ok\n" }],
            solutionCode: "from tools.helper import value\nprint(value())\n",
          },
          solutionFiles,
        }),
        makeArgs(),
        {
          runtimeDefaults: {
            kind: "code",
            language: "python",
            supportsFileSystem: true,
            supportsMultiFile: true,
            supportsTerminal: false,
          },
        } as any,
    );

    expect((result.expected as any).solutionFiles).toEqual(solutionFiles);
    expect((result.expected as any).solutionCode).toBe(
        "from tools.helper import value\nprint(value())\n",
    );

    // Important: do not leak reveal-only files on the public exercise payload.
    expect((result.exercise as any).solutionFiles).toBeUndefined();
  });
  it("keeps terminal disabled when runtime defaults do not request it", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef(),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsFileSystem: true,
          supportsTerminal: false,
        },
      } as any,
    );

    const fullIde = resolveFullIDEConfigFromLearningIde({
      ideConfig: (result.exercise as any).ideConfig ?? null,
    });

    expect(fullIde.services.explorer?.enabled).toBe(true);
    expect(fullIde.services.editor?.showEditor).toBe(true);
    expect(fullIde.services.editor?.showTabs).toBe(true);
    expect(fullIde.access.canUseMultiFile).toBe(true);
    expect(fullIde.services.runner?.showTerminal).not.toBe(true);
  });

  it("does not enable files for single-file python runtime defaults", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef(),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsTerminal: false,
          supportsFileSystem: false,
          supportsMultiFile: false,
        },
      } as any,
    );

    expect((result.exercise as any).ideConfig).toBeUndefined();
  });

  it("lets service overrides still require files explicitly", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef({
        serviceOverrides: {
          requires: {
            files: true,
            multiFile: false,
          },
        },
      }),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsTerminal: false,
          supportsFileSystem: false,
          supportsMultiFile: false,
        },
      } as any,
    );

    expect((result.exercise as any).ideConfig).toMatchObject({
      requires: {
        files: true,
        multiFile: false,
      },
    });
  });

  it("gives file-enabled exercises FullIDE explorer access from runtime defaults", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef(),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsFileSystem: true,
          supportsMultiFile: true,
          supportsTerminal: false,
        },
      } as any,
    );

    const fullIde = resolveFullIDEConfigFromLearningIde({
      ideConfig: (result.exercise as any).ideConfig ?? null,
    });

    expect(fullIde.services.explorer?.enabled).toBe(true);
    expect(fullIde.access.canUseMultiFile).toBe(true);
    expect(fullIde.services.runner?.enableWorkspaceTerminal).not.toBe(true);
  });

  it("maps shell_task terminal_workspace manifests to bash code_input with PTY IDE config", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef(LINUX_COURSE1_TERMINAL_FIXTURE as any),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsTerminal: false,
          supportsFileSystem: false,
          supportsMultiFile: false,
        },
      } as any,
    );

    expect(result.exercise.kind).toBe("code_input");
    expect((result.exercise as any).language).toBe("bash");
    expect((result.exercise as any).workspace).toEqual({
      entryFile: "README.md",
      starterFiles: [
        {
          path: "README.md",
          content: "Use the terminal to create linux-lab/notes/today.txt",
        },
      ],
    });
    expect((result.exercise as any).ideConfig).toMatchObject({
      runnerBackend: "pty",
      layoutMode: "terminal_workspace",
      terminalSessionScope: "exercise",
      fileActions: {
        enabled: false,
      },
      requires: {
        files: true,
        multiFile: true,
        terminal: true,
      },
    });
    const fullIde = resolveFullIDEConfigFromLearningIde({
      ideConfig: (result.exercise as any).ideConfig ?? null,
    });

    expect(fullIde.services.explorer?.enabled).toBe(false);
    expect(fullIde.services.explorer?.fileActions).toEqual({
      enabled: false,
      createFile: false,
      createFolder: false,
      rename: false,
      delete: false,
      dragDrop: false,
    });
    expect(fullIde.services.editor?.showEditor).toBe(false);
    expect(fullIde.services.runner?.showTerminal).toBe(true);
    expect(fullIde.services.runner?.allowRun).toBe(false);
    expect((result.expected as any)).toMatchObject({
      recipeType: "shell_task",
      shellTaskMode: "terminal_workspace",
      workspaceExpectations: {
        requiredFolders: [
          "linux-lab",
          "linux-lab/notes",
        ],
        requiredFiles: [
          "linux-lab/notes/today.txt",
        ],
      },
      terminalExpectations: {
        requiredCommands: [
          {
            pattern: "^pwd$",
            message: "Run pwd.",
          },
        ],
        outputContains: ["/workspace"],
        cwdEndsWith: "linux-lab",
      },
    });
  });

  it("preserves authored ideConfig terminalCwd on manifest shell tasks", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef({
        ...LINUX_COURSE1_TERMINAL_FIXTURE,
        ideConfig: {
          runnerBackend: "pty",
          layoutMode: "terminal_workspace",
          terminalSessionScope: "exercise",
          terminalCwd: "/workspace/park-terminal-map",
          requires: {
            files: true,
            multiFile: true,
            terminal: true,
          },
        },
      } as any),
      makeArgs(),
      {
        serviceDefaults: {
          runnerBackend: "pty",
          layoutMode: "terminal_workspace",
          terminalSessionScope: "exercise",
          terminalCwd: "/workspace",
          requires: {
            files: true,
            multiFile: true,
            terminal: true,
          },
        },
        runtimeDefaults: {
          kind: "code",
          language: "bash",
          supportsTerminal: true,
          supportsFileSystem: true,
          supportsMultiFile: true,
        },
      } as any,
    );

    expect((result.exercise as any).ideConfig).toMatchObject({
      runnerBackend: "pty",
      layoutMode: "terminal_workspace",
      terminalSessionScope: "exercise",
      terminalCwd: "/workspace/park-terminal-map",
      requires: {
        files: true,
        multiFile: true,
        terminal: true,
      },
    });
  });

  it("preserves an authored terminalSessionScope override for terminal shell tasks", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef({
        ...LINUX_COURSE1_TERMINAL_FIXTURE,
        serviceOverrides: {
          terminalSessionScope: "project",
        },
      } as any),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsTerminal: false,
          supportsFileSystem: false,
          supportsMultiFile: false,
        },
      } as any,
    );

    expect((result.exercise as any).ideConfig).toMatchObject({
      runnerBackend: "pty",
      layoutMode: "terminal_workspace",
      terminalSessionScope: "project",
      requires: {
        files: true,
        multiFile: true,
        terminal: true,
      },
    });
  });

  it("does not add terminalSessionScope to normal Python code_input exercises", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef(),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsTerminal: false,
          supportsFileSystem: false,
          supportsMultiFile: false,
        },
      } as any,
    );

    expect((result.exercise as any).ideConfig?.terminalSessionScope).toBeUndefined();
    expect((result.expected as any).terminalExpectations).toBeUndefined();
  });

  it("lets exercise runtime fileActions override topic runtime defaults", () => {
    const result = buildExerciseFromManifest(
      makeCodeInputDef({
        runtime: {
          kind: "code",
          fileActions: {
            createFile: false,
            createFolder: false,
          },
        },
      }),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsFileSystem: true,
          supportsMultiFile: true,
          supportsTerminal: false,
          fileActions: {
            enabled: true,
            rename: false,
          },
        },
      } as any,
    );

    expect((result.exercise as any).ideConfig).toMatchObject({
      requires: {
        files: true,
        multiFile: true,
        terminal: false,
      },
      fileActions: {
        enabled: true,
        createFile: false,
        createFolder: false,
        rename: false,
      },
    });
  });

  it("keeps semantic checks on fixed-test exercises for hybrid stdout plus state validation", () => {
    const semanticChecks = [
      {
        type: "variable_equals",
        name: "scores",
        expected: [["Ava", 92]],
        expectedKind: "dict_entries",
      },
    ];

    const result = buildExerciseFromManifest(
      makeCodeInputDef({
        recipe: {
          type: "fixed_tests",
          tests: [{ stdout: "{'Ava': 92}\n" }],
          semanticChecks,
        },
      }),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsTerminal: false,
        },
      } as any,
    );

    expect((result.expected as any).semanticChecks).toEqual(semanticChecks);
  });


  it("keeps source checks on fixed-test exercises for anti-cheat validation", () => {
    const sourceChecks = [
      {
        type: "source_regex",
        pattern: "\\bfruits\\.remove\\s*\\(",
        message: "Use remove().",
      },
    ];

    const result = buildExerciseFromManifest(
      makeCodeInputDef({
        recipe: {
          type: "fixed_tests",
          tests: [{ stdout: "ok\n" }],
          sourceChecks,
        },
      }),
      makeArgs(),
      {
        runtimeDefaults: {
          kind: "code",
          language: "python",
          supportsTerminal: false,
        },
      } as any,
    );

    expect((result.expected as any).sourceChecks).toEqual(sourceChecks);
  });

});
