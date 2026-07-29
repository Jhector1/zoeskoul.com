import type {
  LearningPracticeExercise,
} from "@zoeskoul/learning-contracts";

import {
  asJsonRecord,
  runtimeString,
} from "./studentRuntimePracticeDescriptorShared";

const MAX_EMBEDDED_PYTHON_WORKSPACE_FILES = 9;
const MAX_EMBEDDED_PYTHON_WORKSPACE_CHARACTERS =
  64 * 1024;

type EmbeddedStarterFile = {
  path: string;
  content: string;
  language: "python" | "text" | "csv";
};

type EmbeddedStarterWorkspace = {
  entry: string;
  files: EmbeddedStarterFile[];
  paths: Set<string>;
};

function hasNoEntries(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;

  const record = asJsonRecord(value);
  return record !== null && Object.keys(record).length === 0;
}

function hasNoNamedEntries(
  records: Array<Record<string, unknown> | null>,
  names: readonly string[],
): boolean {
  return records.every((record) =>
    names.every((name) =>
      hasNoEntries(record?.[name]),
    ),
  );
}

function hasNamedEntries(
  records: Array<Record<string, unknown> | null>,
  names: readonly string[],
): boolean {
  return records.some((record) =>
    names.some((name) =>
      !hasNoEntries(record?.[name]),
    ),
  );
}

function isSafeRelativeWorkspacePath(
  value: unknown,
): boolean {
  const path = runtimeString(value);

  return Boolean(
    path &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path
      .split("/")
      .every(
        (part) =>
          Boolean(part) &&
          part !== "." &&
          part !== "..",
      )
  );
}

function starterFileLanguage(
  path: string,
  value: unknown,
): EmbeddedStarterFile["language"] | null {
  const authored = runtimeString(value);

  if (path.endsWith(".py")) {
    return (
      !authored ||
      authored === "python"
    )
      ? "python"
      : null;
  }

  if (path.endsWith(".txt")) {
    return (
      !authored ||
      authored === "text" ||
      authored === "plaintext"
    )
      ? "text"
      : null;
  }

  if (path.endsWith(".csv")) {
    return (
      !authored ||
      authored === "csv" ||
      authored === "text" ||
      authored === "plaintext"
    )
      ? "csv"
      : null;
  }

  return null;
}

function readStarterFiles(
  value: unknown,
  options: {
    min: number;
    max: number;
  },
): EmbeddedStarterFile[] | null {
  if (
    !Array.isArray(value) ||
    value.length < options.min ||
    value.length > options.max
  ) {
    return null;
  }

  const files: EmbeddedStarterFile[] = [];
  const paths = new Set<string>();
  let totalCharacters = 0;

  for (const valueEntry of value) {
    const file = asJsonRecord(valueEntry);
    const path = runtimeString(file?.path);

    if (
      !file ||
      !isSafeRelativeWorkspacePath(path) ||
      paths.has(path) ||
      typeof file.content !== "string"
    ) {
      return null;
    }

    const language = starterFileLanguage(
      path,
      file.language,
    );

    if (!language) return null;

    totalCharacters +=
      file.content.length;

    if (
      totalCharacters >
      MAX_EMBEDDED_PYTHON_WORKSPACE_CHARACTERS
    ) {
      return null;
    }

    paths.add(path);
    files.push({
      path,
      content: file.content,
      language,
    });
  }

  return files;
}

function sameStarterFiles(
  left: EmbeddedStarterFile[],
  right: EmbeddedStarterFile[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightByPath = new Map(
    right.map((file) => [
      file.path,
      file,
    ]),
  );

  return left.every((file) => {
    const match =
      rightByPath.get(file.path);

    return Boolean(
      match &&
      match.content === file.content &&
      match.language === file.language,
    );
  });
}

function sameStarterFileShapes(
  left: EmbeddedStarterFile[],
  right: EmbeddedStarterFile[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightByPath = new Map(
    right.map((file) => [
      file.path,
      file,
    ]),
  );

  return left.every((file) => {
    const match =
      rightByPath.get(file.path);

    return Boolean(
      match &&
      match.language ===
        file.language,
    );
  });
}

function workspaceCompanionFilesMatch(
  value: unknown,
  starterFiles: EmbeddedStarterFile[],
  entry: string,
): boolean {
  if (hasNoEntries(value)) {
    return true;
  }

  const companionFiles =
    starterFiles.filter(
      (file) =>
        file.path !== entry,
    );
  const workspaceFiles =
    readStarterFiles(value, {
      min: companionFiles.length,
      max: companionFiles.length,
    });

  return Boolean(
    workspaceFiles &&
    sameStarterFileShapes(
      companionFiles,
      workspaceFiles,
    ),
  );
}

function readEmbeddedStarterWorkspace(
  exercise: Record<string, unknown>,
  workspace: Record<string, unknown> | null,
): EmbeddedStarterWorkspace | null {
  const topFiles =
    readStarterFiles(
      exercise.starterFiles,
      {
        min: 1,
        max:
          MAX_EMBEDDED_PYTHON_WORKSPACE_FILES,
      },
    );
  const workspaceFiles =
    readStarterFiles(
      workspace?.starterFiles,
      {
        min: 1,
        max:
          MAX_EMBEDDED_PYTHON_WORKSPACE_FILES,
      },
    );
  const entry =
    runtimeString(
      workspace?.entryFilePath,
    );

  if (
    !topFiles ||
    !workspaceFiles ||
    !isSafeRelativeWorkspacePath(
      entry,
    ) ||
    !sameStarterFiles(
      topFiles,
      workspaceFiles,
    )
  ) {
    return null;
  }

  const entryFile =
    topFiles.find(
      (file) =>
        file.path === entry,
    );

  if (
    !entryFile ||
    entryFile.language !== "python"
  ) {
    return null;
  }

  if (
    !workspaceCompanionFilesMatch(
      workspace?.files,
      topFiles,
      entry,
    )
  ) {
    return null;
  }

  return {
    entry,
    files: topFiles,
    paths: new Set(
      topFiles.map(
        (file) => file.path,
      ),
    ),
  };
}

function isSafeEmbeddedTestFile(
  value: unknown,
  workspace: EmbeddedStarterWorkspace,
): boolean {
  const file = asJsonRecord(value);
  const path = runtimeString(
    file?.path,
  );

  if (
    !file ||
    !isSafeRelativeWorkspacePath(path) ||
    typeof file.content !== "string" ||
    file.readOnly !== false ||
    path === workspace.entry
  ) {
    return false;
  }

  return (
    workspace.paths.has(path) ||
    file.content === ""
  );
}

function isSafeEmbeddedFixedTest(
  value: unknown,
  workspace: EmbeddedStarterWorkspace,
): boolean {
  const test = asJsonRecord(value);
  const files = test?.files;

  return Boolean(
    test &&
    typeof test.stdin === "string" &&
    hasNoNamedEntries(
      [test],
      [
        "fixtureFiles",
        "fixtures",
        "fileFixtures",
        "supportFiles",
      ],
    ) &&
    (
      hasNoEntries(files) ||
      (
        Array.isArray(files) &&
        files.length > 0 &&
        files.every(
          (file) =>
            isSafeEmbeddedTestFile(
              file,
              workspace,
            ),
        )
      )
    )
  );
}

function embeddedTestsAreSafe(
  value: unknown,
  workspace: EmbeddedStarterWorkspace,
  allowEmpty: boolean,
): boolean {
  if (hasNoEntries(value)) {
    return allowEmpty;
  }

  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (test) =>
        isSafeEmbeddedFixedTest(
          test,
          workspace,
        ),
    )
  );
}

function validationChecksUseOnlyLearnerFiles(
  exercise: Record<string, unknown>,
  recipe: Record<string, unknown> | null,
  workspace: EmbeddedStarterWorkspace,
): boolean {
  for (const value of [
    exercise.sourceChecks,
    recipe?.sourceChecks,
    exercise.semanticChecks,
    recipe?.semanticChecks,
  ]) {
    if (!Array.isArray(value)) continue;

    for (const checkValue of value) {
      const check =
        asJsonRecord(checkValue);
      const path =
        runtimeString(check?.path);

      if (
        path &&
        !workspace.paths.has(path)
      ) {
        return false;
      }
    }
  }

  return true;
}

function expectationList(
  value: unknown,
): string[] | null {
  if (hasNoEntries(value)) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const result: string[] = [];

  for (const item of value) {
    const path = runtimeString(item);

    if (
      !isSafeRelativeWorkspacePath(path)
    ) {
      return null;
    }

    result.push(path);
  }

  return result;
}

function workspaceRequirementsAreSatisfied(
  exercise: Record<string, unknown>,
  recipe: Record<string, unknown> | null,
  workspaceRecord: Record<string, unknown> | null,
  workspace: EmbeddedStarterWorkspace,
): boolean {
  const expectations = [
    asJsonRecord(
      exercise.workspaceExpectations,
    ),
    asJsonRecord(
      recipe?.workspaceExpectations,
    ),
    asJsonRecord(
      workspaceRecord?.workspaceExpectations,
    ),
  ];

  for (const expectation of expectations) {
    if (!expectation) continue;

    const requiredFiles =
      expectationList(
        expectation.requiredFiles,
      );
    const requiredFolders =
      expectationList(
        expectation.requiredFolders,
      );
    const forbiddenFiles =
      expectationList(
        expectation.forbiddenFiles,
      );

    if (
      !requiredFiles ||
      !requiredFolders ||
      !forbiddenFiles ||
      forbiddenFiles.length > 0 ||
      requiredFiles.some(
        (path) =>
          !workspace.paths.has(path),
      ) ||
      requiredFolders.some(
        (folder) =>
          !workspace.files.some(
            (file) =>
              file.path.startsWith(
                `${folder}/`,
              ),
          ),
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Learner-safe embedded Python contract.
 *
 * The current direct runtime accepts bounded learner-visible Python
 * workspaces. Fixed-test exercises remain limited to one Python entry plus at
 * most one text/CSV companion. Semantic exercises may use an alternate Python
 * entry and up to nine learner-visible Python/text/CSV files. Validation
 * recipes, semantic checks, source checks, fixed-test stdin values, hidden
 * test-file overrides, and solutions remain behind the protected server
 * boundary. Exercises that require creating files or folders stay on the full
 * workspace runtime.
 */
export function isEligibleStudentEmbeddedPythonTryIt(
  value: unknown,
): boolean {
  const exercise = asJsonRecord(value);
  const recipe = asJsonRecord(exercise?.recipe);
  const workspaceRecord =
    asJsonRecord(exercise?.workspace);
  const recipeType =
    runtimeString(recipe?.type);

  if (
    !exercise ||
    runtimeString(exercise.kind) !== "code_input" ||
    runtimeString(exercise.purpose) !== "try_it" ||
    runtimeString(exercise.language) !== "python" ||
    (
      recipeType !== "fixed_tests" &&
      recipeType !== "semantic"
    ) ||
    runtimeString(exercise.stdin) !== "" ||
    runtimeString(exercise.starterStdin) !== "" ||
    !hasNoNamedEntries(
      [exercise, recipe],
      [
        "fixtureFiles",
        "fixtures",
        "fileFixtures",
        "supportFiles",
        "files",
        "initialFiles",
        "workspaceFiles",
      ],
    ) ||
    !hasNoNamedEntries(
      [workspaceRecord],
      [
        "fixtureFiles",
        "fixtures",
        "fileFixtures",
        "supportFiles",
        "initialFiles",
        "workspaceFiles",
      ],
    )
  ) {
    return false;
  }

  const starterWorkspace =
    readEmbeddedStarterWorkspace(
      exercise,
      workspaceRecord,
    );

  const pythonFileCount =
    starterWorkspace?.files.filter(
      (file) =>
        file.language === "python",
    ).length ?? 0;

  if (
    !starterWorkspace ||
    (
      recipeType === "fixed_tests" &&
      (
        pythonFileCount !== 1 ||
        starterWorkspace.files.length > 2
      )
    ) ||
    !validationChecksUseOnlyLearnerFiles(
      exercise,
      recipe,
      starterWorkspace,
    ) ||
    !workspaceRequirementsAreSatisfied(
      exercise,
      recipe,
      workspaceRecord,
      starterWorkspace,
    )
  ) {
    return false;
  }

  const tests = recipe?.tests;

  if (recipeType === "fixed_tests") {
    return embeddedTestsAreSafe(
      tests,
      starterWorkspace,
      false,
    );
  }

  return (
    embeddedTestsAreSafe(
      tests,
      starterWorkspace,
      true,
    ) &&
    hasNamedEntries(
      [recipe, exercise],
      ["semanticChecks"],
    )
  );
}

export function isProjectedStudentEmbeddedPythonTryIt(
  exercise: LearningPracticeExercise,
): boolean {
  if (exercise.kind !== "code_input") {
    return false;
  }

  const payload = exercise.payload;
  const language =
    runtimeString(payload.language) ||
    runtimeString(payload.lang);
  const workspace =
    asJsonRecord(payload.workspace);

  return Boolean(
    language === "python" &&
    readEmbeddedStarterWorkspace(
      payload,
      workspace,
    ),
  );
}
