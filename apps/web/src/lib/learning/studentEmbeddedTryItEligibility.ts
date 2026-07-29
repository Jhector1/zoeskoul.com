import type {
  LearningPracticeExercise,
} from "@zoeskoul/learning-contracts";

import {
  asJsonRecord,
  runtimeString,
} from "./studentRuntimePracticeDescriptorShared";

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

function isMainPythonStarterFile(
  value: unknown,
): boolean {
  const file = asJsonRecord(value);
  if (!file) return false;

  return (
    runtimeString(file.path) === "main.py" &&
    typeof file.content === "string" &&
    (
      file.language == null ||
      runtimeString(file.language) === "python"
    )
  );
}

function oneMainPythonStarterFile(
  value: unknown,
): boolean {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    isMainPythonStarterFile(value[0])
  );
}

function isSafeRelativeWorkspacePath(
  value: unknown,
): boolean {
  const path = runtimeString(value);

  return Boolean(
    path &&
    path !== "main.py" &&
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

function isSafeEmbeddedOutputFile(
  value: unknown,
): boolean {
  const file = asJsonRecord(value);

  return Boolean(
    file &&
    isSafeRelativeWorkspacePath(
      file.path,
    ) &&
    file.content === "" &&
    file.readOnly === false
  );
}

function isSafeEmbeddedFixedTest(
  value: unknown,
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
          isSafeEmbeddedOutputFile,
        )
      )
    )
  );
}

function fixedTestsUseOutputFiles(
  tests: unknown[],
): boolean {
  return tests.some((value) => {
    const test = asJsonRecord(value);

    return !hasNoEntries(
      test?.files,
    );
  });
}

function sourceChecksUseOnlyMainPython(
  exercise: Record<string, unknown>,
  recipe: Record<string, unknown> | null,
): boolean {
  for (const value of [
    exercise.sourceChecks,
    recipe?.sourceChecks,
  ]) {
    if (!Array.isArray(value)) continue;

    for (const checkValue of value) {
      const check =
        asJsonRecord(checkValue);
      const path =
        runtimeString(check?.path);

      if (path && path !== "main.py") {
        return false;
      }
    }
  }

  return true;
}

function hasNoWorkspaceFileRequirements(
  exercise: Record<string, unknown>,
  recipe: Record<string, unknown> | null,
  workspace: Record<string, unknown> | null,
): boolean {
  const expectations = [
    asJsonRecord(
      exercise.workspaceExpectations,
    ),
    asJsonRecord(
      recipe?.workspaceExpectations,
    ),
    asJsonRecord(
      workspace?.workspaceExpectations,
    ),
  ];

  return hasNoNamedEntries(
    expectations,
    [
      "requiredFiles",
      "requiredFolders",
      "forbiddenFiles",
    ],
  );
}

/**
 * Learner-safe one-file Vite code-input contract. The authored validation
 * recipe, semantic checks, source checks, fixed-test stdin values, tests, and
 * solutions remain behind the protected server boundary. Multi-file,
 * fixture-backed, terminal, SQL, and learner-editable stdin workspaces
 * continue through the full workspace runtime.
 */
export function isEligibleStudentEmbeddedPythonTryIt(
  value: unknown,
): boolean {
  const exercise = asJsonRecord(value);
  const recipe = asJsonRecord(exercise?.recipe);
  const workspace = asJsonRecord(exercise?.workspace);
  const recipeType = runtimeString(recipe?.type);

  if (
    !exercise ||
    runtimeString(exercise.kind) !== "code_input" ||
    runtimeString(exercise.purpose) !== "try_it" ||
    runtimeString(exercise.language) !== "python" ||
    (
      recipeType !== "fixed_tests" &&
      recipeType !== "semantic"
    ) ||
    !oneMainPythonStarterFile(exercise.starterFiles) ||
    runtimeString(workspace?.entryFilePath) !== "main.py" ||
    !oneMainPythonStarterFile(workspace?.starterFiles) ||
    runtimeString(exercise.stdin) !== "" ||
    runtimeString(exercise.starterStdin) !== "" ||
    !hasNoNamedEntries(
      [exercise, recipe, workspace],
      [
        "fixtureFiles",
        "fixtures",
        "fileFixtures",
        "supportFiles",
        "files",
        "initialFiles",
        "workspaceFiles",
      ],
    )
  ) {
    return false;
  }

  const tests = recipe?.tests;

  if (recipeType === "fixed_tests") {
    if (
      !Array.isArray(tests) ||
      tests.length === 0 ||
      !tests.every(
        isSafeEmbeddedFixedTest,
      )
    ) {
      return false;
    }

    return (
      !fixedTestsUseOutputFiles(
        tests,
      ) ||
      (
        sourceChecksUseOnlyMainPython(
          exercise,
          recipe,
        ) &&
        hasNoWorkspaceFileRequirements(
          exercise,
          recipe,
          workspace,
        )
      )
    );
  }

  return (
    hasNoEntries(tests) &&
    hasNamedEntries(
      [recipe, exercise],
      ["semanticChecks"],
    )
  );
}

export function isProjectedStudentEmbeddedPythonTryIt(
  exercise: LearningPracticeExercise,
): boolean {
  if (exercise.kind !== "code_input") return false;

  const payload = exercise.payload;
  const language =
    runtimeString(payload.language) ||
    runtimeString(payload.lang);
  const workspace = asJsonRecord(payload.workspace);

  return (
    language === "python" &&
    oneMainPythonStarterFile(payload.starterFiles) &&
    runtimeString(workspace?.entryFilePath) === "main.py" &&
    oneMainPythonStarterFile(workspace?.starterFiles)
  );
}
