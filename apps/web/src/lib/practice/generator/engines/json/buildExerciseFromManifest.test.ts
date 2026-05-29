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
});
