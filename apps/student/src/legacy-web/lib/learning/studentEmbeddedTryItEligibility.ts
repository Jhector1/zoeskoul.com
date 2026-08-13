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
const MAX_EMBEDDED_PYTHON_CREATED_FILES = 2;
const MAX_EMBEDDED_PYTHON_PACKAGE_MARKER_CHARACTERS =
  1024;

type EmbeddedStarterFile = {
  path: string;
  content: string;
  language: "python" | "text" | "csv";
};

type EmbeddedWorkspaceRequirements = {
  requiredFiles: string[];
  requiredFolders: string[];
  forbiddenFiles: string[];
};

type EmbeddedStarterWorkspace = {
  entry: string;
  files: EmbeddedStarterFile[];
  visiblePaths: Set<string>;
  paths: Set<string>;
  creatableFiles: string[];
  creatablePaths: Set<string>;
  packageMarkerPaths: Set<string>;
  exactTestOverlayFiles: Map<string, string>;
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

function totalStarterCharacters(
  files: EmbeddedStarterFile[],
): number {
  return files.reduce(
    (total, file) =>
      total + file.content.length,
    0,
  );
}

function mergeLearnerWorkspaceFiles(
  value: unknown,
  starterFiles: EmbeddedStarterFile[],
  entry: string,
): {
  files: EmbeddedStarterFile[];
  exactTestOverlayFiles: Map<string, string>;
} | null {
  if (hasNoEntries(value)) {
    return {
      files: starterFiles,
      exactTestOverlayFiles:
        new Map<string, string>(),
    };
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const workspaceFiles =
    readStarterFiles(value, {
      min: 1,
      max:
        MAX_EMBEDDED_PYTHON_WORKSPACE_FILES,
    });

  if (!workspaceFiles) {
    return null;
  }

  const companionFiles =
    starterFiles.filter(
      (file) =>
        file.path !== entry,
    );
  const companionPaths =
    new Set(
      companionFiles.map(
        (file) => file.path,
      ),
    );

  if (
    workspaceFiles.every(
      (file) =>
        companionPaths.has(file.path),
    )
  ) {
    return sameStarterFileShapes(
      companionFiles,
      workspaceFiles,
    )
      ? {
          files: starterFiles,
          exactTestOverlayFiles:
            new Map<string, string>(),
        }
      : null;
  }

  const starterPaths =
    new Set(
      starterFiles.map(
        (file) => file.path,
      ),
    );

  if (
    workspaceFiles.some(
      (file) =>
        starterPaths.has(file.path) ||
        file.language === "python",
    ) ||
    value.some((fileValue) => {
      const file =
        asJsonRecord(fileValue);

      return file?.readOnly !== false;
    })
  ) {
    return null;
  }

  const files = [
    ...starterFiles,
    ...workspaceFiles,
  ];

  if (
    files.length >
      MAX_EMBEDDED_PYTHON_WORKSPACE_FILES ||
    totalStarterCharacters(files) >
      MAX_EMBEDDED_PYTHON_WORKSPACE_CHARACTERS
  ) {
    return null;
  }

  return {
    files,
    exactTestOverlayFiles:
      new Map(
        workspaceFiles.map(
          (file) => [
            file.path,
            file.content,
          ],
        ),
      ),
  };
}

function readWorkspaceRequirements(
  exercise: Record<string, unknown>,
  recipe: Record<string, unknown> | null,
  workspaceRecord: Record<string, unknown> | null,
): EmbeddedWorkspaceRequirements | null {
  const requiredFiles =
    new Set<string>();
  const requiredFolders =
    new Set<string>();
  const forbiddenFiles =
    new Set<string>();

  for (const expectation of [
    asJsonRecord(
      exercise.workspaceExpectations,
    ),
    asJsonRecord(
      recipe?.workspaceExpectations,
    ),
    asJsonRecord(
      workspaceRecord?.workspaceExpectations,
    ),
  ]) {
    if (!expectation) continue;

    const files =
      expectationList(
        expectation.requiredFiles,
      );
    const folders =
      expectationList(
        expectation.requiredFolders,
      );
    const forbidden =
      expectationList(
        expectation.forbiddenFiles,
      );

    if (
      !files ||
      !folders ||
      !forbidden
    ) {
      return null;
    }

    files.forEach(
      (path) =>
        requiredFiles.add(path),
    );
    folders.forEach(
      (path) =>
        requiredFolders.add(path),
    );
    forbidden.forEach(
      (path) =>
        forbiddenFiles.add(path),
    );
  }

  return {
    requiredFiles:
      [...requiredFiles].sort(),
    requiredFolders:
      [...requiredFolders].sort(),
    forbiddenFiles:
      [...forbiddenFiles].sort(),
  };
}

function folderContainsPath(
  folder: string,
  path: string,
): boolean {
  return path.startsWith(
    `${folder}/`,
  );
}

function visibleWorkspaceFolders(
  paths: Set<string>,
): Set<string> {
  const folders =
    new Set<string>();

  for (const path of paths) {
    const parts =
      path.split("/");
    let current = "";

    for (
      const part
      of parts.slice(0, -1)
    ) {
      current =
        current
          ? `${current}/${part}`
          : part;
      folders.add(current);
    }
  }

  return folders;
}

function readCreatablePythonFiles(
  args: {
    requirements:
      EmbeddedWorkspaceRequirements;
    visibleFiles:
      EmbeddedStarterFile[];
    entry: string;
    allowCreation: boolean;
  },
): {
  creatableFiles: string[];
  packageMarkerPaths: Set<string>;
} | null {
  const visiblePaths =
    new Set(
      args.visibleFiles.map(
        (file) => file.path,
      ),
    );
  const visibleFolders =
    visibleWorkspaceFolders(
      visiblePaths,
    );
  const missingFiles =
    args.requirements.requiredFiles
      .filter(
        (path) =>
          !visiblePaths.has(path),
      );
  const missingFolders =
    args.requirements.requiredFolders
      .filter(
        (folder) =>
          !visibleFolders.has(folder),
      );

  if (missingFiles.length === 0) {
    return missingFolders.length === 0
      ? {
          creatableFiles: [],
          packageMarkerPaths:
            new Set<string>(),
        }
      : null;
  }

  if (
    !args.allowCreation ||
    missingFiles.length >
      MAX_EMBEDDED_PYTHON_CREATED_FILES ||
    args.visibleFiles.length +
      missingFiles.length >
      MAX_EMBEDDED_PYTHON_WORKSPACE_FILES ||
    args.requirements.requiredFolders
      .length === 0 ||
    missingFiles.some(
      (path) =>
        path === args.entry ||
        !path.endsWith(".py") ||
        !path.includes("/") ||
        !args.requirements
          .requiredFolders
          .some(
            (folder) =>
              folderContainsPath(
                folder,
                path,
              ),
          ),
    ) ||
    missingFolders.some(
      (folder) =>
        !missingFiles.some(
          (path) =>
            folderContainsPath(
              folder,
              path,
            ),
        ),
    )
  ) {
    return null;
  }

  const creationFolders =
    args.requirements.requiredFolders
      .filter(
        (folder) =>
          missingFiles.some(
            (path) =>
              folderContainsPath(
                folder,
                path,
              ),
          ),
      );

  return {
    creatableFiles:
      [...missingFiles].sort(),
    packageMarkerPaths:
      new Set(
        creationFolders.map(
          (folder) =>
            `${folder}/__init__.py`,
        ),
      ),
  };
}

function readEmbeddedStarterWorkspace(
  exercise: Record<string, unknown>,
  workspace: Record<string, unknown> | null,
  requirements:
    EmbeddedWorkspaceRequirements,
  options: {
    allowCreation: boolean;
  },
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

  const learnerWorkspace =
    mergeLearnerWorkspaceFiles(
      workspace?.files,
      topFiles,
      entry,
    );

  if (!learnerWorkspace) {
    return null;
  }

  const creation =
    readCreatablePythonFiles({
      requirements,
      visibleFiles:
        learnerWorkspace.files,
      entry,
      allowCreation:
        options.allowCreation,
    });

  if (!creation) {
    return null;
  }

  const visiblePaths =
    new Set(
      learnerWorkspace.files.map(
        (file) => file.path,
      ),
    );
  const creatablePaths =
    new Set(
      creation.creatableFiles,
    );

  return {
    entry,
    files:
      learnerWorkspace.files,
    visiblePaths,
    paths: new Set([
      ...visiblePaths,
      ...creatablePaths,
    ]),
    creatableFiles:
      creation.creatableFiles,
    creatablePaths,
    packageMarkerPaths:
      creation.packageMarkerPaths,
    exactTestOverlayFiles:
      learnerWorkspace
        .exactTestOverlayFiles,
  };
}

function isCommentOnlyPython(
  content: string,
): boolean {
  return content
    .split(/\r?\n/)
    .every((line) => {
      const trimmed =
        line.trim();

      return (
        !trimmed ||
        trimmed.startsWith("#")
      );
    });
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
    path === workspace.entry
  ) {
    return false;
  }

  const language =
    starterFileLanguage(
      path,
      file.language,
    );

  if (!language) {
    return false;
  }

  const exactOverlay =
    workspace.exactTestOverlayFiles
      .get(path);

  if (exactOverlay !== undefined) {
    return (
      file.readOnly === false &&
      file.content === exactOverlay
    );
  }

  if (
    workspace.creatablePaths.has(path)
  ) {
    return (
      language === "python" &&
      (
        file.readOnly === undefined ||
        file.readOnly === false
      )
    );
  }

  if (
    workspace.packageMarkerPaths
      .has(path)
  ) {
    return (
      language === "python" &&
      file.content.length <=
        MAX_EMBEDDED_PYTHON_PACKAGE_MARKER_CHARACTERS &&
      isCommentOnlyPython(
        file.content,
      ) &&
      (
        file.readOnly === undefined ||
        file.readOnly === false
      )
    );
  }

  return (
    file.readOnly === false &&
    (
      workspace.visiblePaths.has(
        path,
      ) ||
      file.content === ""
    )
  );
}

function isSafeEmbeddedFixedTest(
  value: unknown,
  workspace: EmbeddedStarterWorkspace,
): boolean {
  const test = asJsonRecord(value);
  const files = test?.files;

  if (
    !test ||
    typeof test.stdin !== "string" ||
    !hasNoNamedEntries(
      [test],
      [
        "fixtureFiles",
        "fixtures",
        "fileFixtures",
        "supportFiles",
      ],
    )
  ) {
    return false;
  }

  if (hasNoEntries(files)) {
    return (
      workspace.creatableFiles
        .length === 0
    );
  }

  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    files.some(
      (file) =>
        !isSafeEmbeddedTestFile(
          file,
          workspace,
        ),
    )
  ) {
    return false;
  }

  const paths =
    files.map((fileValue) =>
      runtimeString(
        asJsonRecord(fileValue)?.path,
      ),
    );
  const uniquePaths =
    new Set(paths);

  if (
    uniquePaths.size !==
      paths.length
  ) {
    return false;
  }

  if (
    workspace.creatableFiles
      .length === 0
  ) {
    return true;
  }

  const expectedPaths =
    new Set([
      ...workspace.creatableFiles,
      ...workspace.packageMarkerPaths,
    ]);

  return (
    uniquePaths.size ===
      expectedPaths.size &&
    [...expectedPaths].every(
      (path) =>
        uniquePaths.has(path),
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

function sourceChecksCoverCreatableFiles(
  exercise: Record<string, unknown>,
  recipe: Record<string, unknown> | null,
  workspace: EmbeddedStarterWorkspace,
): boolean {
  if (
    workspace.creatableFiles
      .length === 0
  ) {
    return true;
  }

  const checkedPaths =
    new Set<string>();

  for (const value of [
    exercise.sourceChecks,
  ]) {
    if (!Array.isArray(value)) {
      continue;
    }

    for (const checkValue of value) {
      const path =
        runtimeString(
          asJsonRecord(
            checkValue,
          )?.path,
        );

      if (path) {
        checkedPaths.add(path);
      }
    }
  }

  return workspace.creatableFiles
    .every(
      (path) =>
        checkedPaths.has(path),
    );
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
  requirements:
    EmbeddedWorkspaceRequirements,
  workspace: EmbeddedStarterWorkspace,
): boolean {
  return (
    requirements
      .forbiddenFiles.length === 0 &&
    requirements
      .requiredFiles.every(
        (path) =>
          workspace.paths.has(path),
      ) &&
    requirements
      .requiredFolders.every(
        (folder) =>
          [...workspace.paths]
            .some(
              (path) =>
                folderContainsPath(
                  folder,
                  path,
                ),
            ),
      )
  );
}

/**
 * Learner-safe embedded Python contract.
 *
 * The current direct runtime accepts bounded learner-visible Python
 * workspaces. Fixed-test exercises remain limited to one Python entry plus at
 * most one learner-visible text/CSV companion, including a bounded
 * workspace-file data overlay. Semantic exercises may use an alternate Python
 * entry and up to nine learner-visible Python/text/CSV files. Validation
 * recipes, semantic checks, source checks, fixed-test stdin values, hidden
 * test-file overrides, and solutions remain behind the protected server
 * boundary. Fixed-test exercises may additionally declare up to two exact
 * learner-created Python paths under authored required folders.
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

  const requirements =
    readWorkspaceRequirements(
      exercise,
      recipe,
      workspaceRecord,
    );

  if (!requirements) {
    return false;
  }

  const starterWorkspace =
    readEmbeddedStarterWorkspace(
      exercise,
      workspaceRecord,
      requirements,
      {
        allowCreation:
          recipeType ===
          "fixed_tests",
      },
    );

  const pythonFileCount =
    starterWorkspace?.files.filter(
      (file) =>
        file.language === "python",
    ).length ?? 0;
  const hasCreatedFiles =
    Boolean(
      starterWorkspace
        ?.creatableFiles.length,
    );

  if (
    !starterWorkspace ||
    (
      recipeType === "fixed_tests" &&
      (
        pythonFileCount !== 1 ||
        (
          hasCreatedFiles
            ? starterWorkspace
                .files.length !== 1
            : starterWorkspace
                .files.length > 2
        )
      )
    ) ||
    !validationChecksUseOnlyLearnerFiles(
      exercise,
      recipe,
      starterWorkspace,
    ) ||
    !sourceChecksCoverCreatableFiles(
      exercise,
      recipe,
      starterWorkspace,
    ) ||
    !workspaceRequirementsAreSatisfied(
      requirements,
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
    starterWorkspace
      .creatableFiles.length === 0 &&
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

  const requirements =
    readWorkspaceRequirements(
      payload,
      null,
      workspace,
    );

  return Boolean(
    language === "python" &&
    requirements &&
    readEmbeddedStarterWorkspace(
      payload,
      workspace,
      requirements,
      {
        allowCreation: true,
      },
    ),
  );
}
