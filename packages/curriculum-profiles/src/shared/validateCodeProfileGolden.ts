import type {
    ManifestCodeInput,
    ManifestStarterFile,
    ManifestFileFixture,
    ManifestStarterFiles,
    TopicAuthoringDraft,
    TopicBundleManifest,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";
import {
    createJudge0CodeRunnerFromEnv,
    getCodeRunner,
    validateCodeAgainstTests,
    validateSemanticCode,
} from "@zoeskoul/curriculum-runtime";
import { parseCodeExpected } from "@zoeskoul/practice-checks";
import {
    buildCodeInputExpected,
} from "../base/codeInputExpected.js";
import type { GoldenValidationIssue } from "./profileServices.js";






function normalizeWorkspaceFiles(
    files: ManifestStarterFiles | undefined,
): Array<{ path: string; content: string }> {
    if (!files) return [];

    if (Array.isArray(files)) {
        return files
            .map((file) => {
                if (typeof file === "string") {
                    return null;
                }

                const filePath = typeof file.path === "string" ? file.path.trim() : "";
                if (!filePath) return null;

                return {
                    path: filePath,
                    content: String(file.content ?? ""),
                };
            })
            .filter((file): file is { path: string; content: string } => Boolean(file));
    }

    return Object.entries(files)
        .map(([filePath, value]) => ({
            path: filePath,
            content: typeof value === "string" ? value : String(value?.content ?? ""),
        }))
        .filter((file) => file.path.trim().length > 0);
}

function normalizeStarterFileRecords(
    files: ManifestStarterFiles | undefined,
): Array<ManifestStarterFile & { path: string }> {
    if (!files) return [];

    if (Array.isArray(files)) {
        return files
            .map((file) => {
                if (!file || typeof file !== "object") {
                    return null;
                }

                const path = typeof file.path === "string" ? file.path.trim() : "";
                if (!path) return null;

                return {
                    ...file,
                    path,
                };
            })
            .filter((file): file is ManifestStarterFile & { path: string } => Boolean(file));
    }

    return Object.entries(files)
        .map(([path, value]) => ({
            path,
            ...(typeof value === "string" ? { content: value } : value),
        }))
        .filter((file) => typeof file.path === "string" && file.path.trim().length > 0);
}

function collectExerciseWorkspaceFiles(
    exercise: ManifestCodeInput,
): Array<{ path: string; content: string }> {
    const merged = new Map<string, string>();
    const starterSources = [
        exercise.workspace?.files,
        exercise.workspace?.initialFiles,
        exercise.workspace?.workspaceFiles,
        exercise.workspace?.starterFiles,
        exercise.starterFiles,
    ];

    for (const source of starterSources) {
        for (const file of normalizeWorkspaceFiles(source)) {
            if (!merged.has(file.path)) {
                merged.set(file.path, file.content);
            }
        }
    }

    const solutionSources = [
        exercise.solutionFiles,
        exercise.recipe.type === "fixed_tests" || exercise.recipe.type === "semantic"
            ? exercise.recipe.solutionFiles
            : undefined,
    ];

    // Golden validation checks the official solution, so any solved files must
    // override starter files. Otherwise a semantic multifile solution can be
    // validated against starter helper modules and fail even though the
    // published reveal/fill solutionFiles are correct.
    for (const source of solutionSources) {
        for (const file of normalizeWorkspaceFiles(source)) {
            merged.set(file.path, file.content);
        }
    }

    return [...merged.entries()].map(([path, content]) => ({ path, content }));
}


type AuthoredCodeInput = Extract<
    TopicAuthoringDraft["quizDraft"][number],
    { kind: "code_input" }
>;

function findAuthoredCodeInput(
    draft: TopicAuthoringDraft | undefined,
    exerciseId: string,
): AuthoredCodeInput | undefined {
    return draft?.quizDraft?.find(
        (exercise): exercise is AuthoredCodeInput =>
            exercise.kind === "code_input" && exercise.id === exerciseId,
    );
}

function overlayAuthoredFileContents(args: {
    manifestFiles: ManifestStarterFiles | undefined;
    authoredFiles: ManifestStarterFiles | undefined;
}): ManifestStarterFile[] | undefined {
    const manifestFiles = normalizeStarterFileRecords(args.manifestFiles);
    const authoredFiles = normalizeStarterFileRecords(args.authoredFiles);

    if (authoredFiles.length === 0) {
        return manifestFiles.length > 0 ? manifestFiles : undefined;
    }

    const authoredByPath = new Map(
        authoredFiles.map((file) => [file.path, file] as const),
    );

    if (manifestFiles.length === 0) {
        return authoredFiles;
    }

    return manifestFiles.map((file) => {
        const authored = authoredByPath.get(file.path);
        return authored
            ? {
                ...file,
                content: authored.content,
            }
            : file;
    });
}

function resolveAuthoredSolutionCode(args: {
    exercise: ManifestCodeInput;
    authored: AuthoredCodeInput;
    authoredSolutionFiles: ManifestStarterFile[] | undefined;
}): string | undefined {
    const entryFilePath =
        args.exercise.workspace?.entryFilePath ??
        args.authored.entryFilePath ??
        args.authoredSolutionFiles?.find(
            (file) => file.isEntry === true || file.entry === true,
        )?.path;
    const entrySolution = entryFilePath
        ? args.authoredSolutionFiles?.find((file) => file.path === entryFilePath)
        : undefined;

    if (
        Array.isArray(args.authored.solutionFiles) &&
        args.authored.solutionFiles.length > 0 &&
        typeof entrySolution?.content === "string"
    ) {
        return entrySolution.content;
    }

    return typeof args.authored.solutionCode === "string"
        ? args.authored.solutionCode
        : undefined;
}

/**
 * Topic bundles intentionally store translatable code as message references.
 * Golden validation runs before messages are emitted, so it must execute the
 * authored code rather than the unresolved @: message tags.
 */
function hydrateAuthoredCodeForGolden(args: {
    exercise: ManifestCodeInput;
    draft?: TopicAuthoringDraft;
}): ManifestCodeInput {
    const authored = findAuthoredCodeInput(args.draft, args.exercise.id);
    if (!authored) return args.exercise;

    const starterFiles = overlayAuthoredFileContents({
        manifestFiles:
            args.exercise.starterFiles ?? args.exercise.workspace?.starterFiles,
        authoredFiles: authored.starterFiles,
    });
    const solutionFiles = overlayAuthoredFileContents({
        manifestFiles:
            args.exercise.solutionFiles ??
            (args.exercise.recipe.type === "fixed_tests" ||
            args.exercise.recipe.type === "semantic"
                ? args.exercise.recipe.solutionFiles
                : undefined),
        authoredFiles: authored.solutionFiles,
    });
    const solutionCode = resolveAuthoredSolutionCode({
        exercise: args.exercise,
        authored,
        authoredSolutionFiles: solutionFiles,
    });
    const recipe =
        args.exercise.recipe.type === "fixed_tests" ||
        args.exercise.recipe.type === "semantic"
            ? {
                ...args.exercise.recipe,
                ...(solutionCode ? { solutionCode } : {}),
                ...(solutionFiles ? { solutionFiles } : {}),
            }
            : args.exercise.recipe;

    return {
        ...args.exercise,
        ...(starterFiles ? { starterFiles } : {}),
        ...(solutionFiles ? { solutionFiles } : {}),
        ...(args.exercise.workspace
            ? {
                workspace: {
                    ...args.exercise.workspace,
                    ...(starterFiles ? { starterFiles } : {}),
                },
            }
            : {}),
        recipe,
    };
}

function semanticModuleNameForPath(filePath: string): string | null {
    const normalized = String(filePath ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\//, "");

    if (!normalized.endsWith(".py")) return null;
    if (normalized.endsWith("/__init__.py")) return null;

    const name = normalized
        .replace(/\.py$/, "")
        .split("/")
        .filter(Boolean)
        .join(".");

    return name && name !== "main" ? name : null;
}

function collectSemanticModuleNames(files: Array<{ path: string; content: string }>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const file of files) {
        const moduleName = semanticModuleNameForPath(file.path);
        if (!moduleName || seen.has(moduleName)) continue;
        seen.add(moduleName);
        result.push(moduleName);
    }

    return result;
}

function normalizeTestFiles(
    files: ManifestFileFixture[] | undefined,
): Array<{ path: string; content: string }> | undefined {
    if (!Array.isArray(files) || files.length < 1) return undefined;

    const normalized = files
        .map((file) => {
            const path = typeof file.path === "string" ? file.path.trim() : "";
            if (!path) return null;
            return {
                path,
                content: String(file.content ?? ""),
            };
        })
        .filter((file): file is { path: string; content: string } => Boolean(file));

    return normalized.length > 0 ? normalized : undefined;
}

function buildSolutionCompletenessIssues(
    exercise: ManifestCodeInput,
): GoldenValidationIssue[] {
    const starterFiles = normalizeStarterFileRecords(
        exercise.starterFiles ?? exercise.workspace?.starterFiles,
    );
    const solutionFiles = normalizeStarterFileRecords(
        exercise.solutionFiles ??
            (exercise.recipe.type === "fixed_tests" || exercise.recipe.type === "semantic"
                ? exercise.recipe.solutionFiles
                : undefined),
    );
    const starterPaths = starterFiles
        .map((file) => String(file.path ?? "").trim())
        .filter(Boolean);
    const solutionPathSet = new Set(
        solutionFiles.map((file) => String(file.path ?? "").trim()).filter(Boolean),
    );
    const issues: GoldenValidationIssue[] = [];
    const isMultiFile = starterPaths.length > 1 || solutionPathSet.size > 1;

    // Single-file exercises can be fully revealed/filled from solutionCode.
    // Do not require solutionFiles just because the workspace also includes
    // read-only input fixtures such as names.txt or data.csv.
    if (!isMultiFile) {
        return issues;
    }

    if (solutionFiles.length === 0) {
        issues.push({
            code: "CODE_PROFILE_MULTI_FILE_SOLUTION_MISSING",
            category: "recipe",
            severity: "error",
            exerciseId: exercise.id,
            message:
                `Exercise "${exercise.id}" uses a multi-file workspace but does not publish complete solutionFiles for reveal/fill.`,
        });
        return issues;
    }

    const missingPaths = starterPaths.filter((path) => !solutionPathSet.has(path));
    if (missingPaths.length > 0) {
        issues.push({
            code: "CODE_PROFILE_MULTI_FILE_SOLUTION_INCOMPLETE",
            category: "recipe",
            severity: "error",
            exerciseId: exercise.id,
            message:
                `Exercise "${exercise.id}" solutionFiles are missing starter workspace paths: ${missingPaths.join(", ")}.`,
        });
    }

    return issues;
}

export async function validateCodeProfileGolden(args: {
    profileId: string;
    expectedLanguage: Exclude<WorkspaceLanguage, "sql">;
    allowedRecipeTypes: Array<ManifestCodeInput["recipe"]["type"]>;
    topicBundle: TopicBundleManifest;
    draft?: TopicAuthoringDraft;
}): Promise<GoldenValidationIssue[]> {
    const issues: GoldenValidationIssue[] = [];



    const sharedCodeRunner = getCodeRunner() ?? createJudge0CodeRunnerFromEnv();



    const runtime = args.topicBundle.runtimeDefaults;
    if (runtime?.kind === "sql") {
        issues.push({
            code: "CODE_PROFILE_RUNTIME_KIND_MISMATCH",
            category: "runtime",
            severity: "error",
            message: `Topic bundle runtime defaults use SQL for profile "${args.profileId}", but this profile expects code runtime defaults for ${args.expectedLanguage}.`,
        });
    } else if (
        runtime?.kind === "code" &&
        runtime.language &&
        runtime.language !== args.expectedLanguage
    ) {
        issues.push({
            code: "CODE_PROFILE_RUNTIME_LANGUAGE_MISMATCH",
            category: "runtime",
            severity: "error",
            message: `Topic bundle runtime defaults declare language "${runtime.language}" for profile "${args.profileId}", expected "${args.expectedLanguage}".`,
        });
    }

    for (const manifestExercise of args.topicBundle.exercises) {
        if (manifestExercise.kind !== "code_input") continue;

        const exercise = hydrateAuthoredCodeForGolden({
            exercise: manifestExercise,
            draft: args.draft,
        });

        if (!exercise.language) {
            issues.push({
                code: "CODE_PROFILE_EXERCISE_LANGUAGE_MISSING",
                category: "runtime",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" is missing an explicit code_input language; expected "${args.expectedLanguage}".`,
            });
        } else if (exercise.language !== args.expectedLanguage) {
            issues.push({
                code: "CODE_PROFILE_EXERCISE_LANGUAGE_MISMATCH",
                category: "runtime",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" declares language "${exercise.language}", expected "${args.expectedLanguage}" for profile "${args.profileId}".`,
            });
        }

        if (!args.allowedRecipeTypes.includes(exercise.recipe.type)) {
            issues.push({
                code: "CODE_PROFILE_RECIPE_TYPE_FORBIDDEN",
                category: "recipe",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" uses recipe type "${exercise.recipe.type}", which is not allowed for profile "${args.profileId}".`,
            });
        }

        issues.push(...buildSolutionCompletenessIssues(exercise));

        if (exercise.fixedSqlDialect) {
            issues.push({
                code: "CODE_PROFILE_SQL_RUNTIME_FIELD_FORBIDDEN",
                category: "runtime",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" sets fixedSqlDialect inside a non-SQL profile.`,
            });
        }

        if (exercise.language !== args.expectedLanguage) {
            continue;
        }

        const rawExpected = buildCodeInputExpected(exercise);
        const parsedExpected = parseCodeExpected(rawExpected);

        if (!parsedExpected.success) {
            issues.push({
                code: "CODE_PROFILE_EXPECTED_SCHEMA_INVALID",
                category: "recipe",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" produced a code_input expected payload that the shared validator rejects.`,
            });
            continue;
        }

        const expected = parsedExpected.data;
        const solutionCode = String(expected.solutionCode ?? "").trim();

        if (!solutionCode) {
            issues.push({
                code: "CODE_PROFILE_SOLUTION_CODE_MISSING",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" has no solutionCode to validate against its tests.`,
            });
            continue;
        }

        if (expected.strategy !== "programming") {
            continue;
        }

        if (expected.checkMode === "semantic") {
            const semanticFiles = collectExerciseWorkspaceFiles(exercise);
            const run = await validateSemanticCode({
                language: exercise.language,
                solutionCode,
                expected,
                files: semanticFiles,
                semanticModuleNames: collectSemanticModuleNames(semanticFiles),
            });

            if (!run.ok) {
                const code =
                    run.reason === "runner_unavailable"
                        ? "CODE_PROFILE_SOLUTION_RUNNER_UNAVAILABLE"
                        : run.reason === "unsupported_language"
                            ? "CODE_PROFILE_SEMANTIC_LANGUAGE_UNSUPPORTED"
                            : "CODE_PROFILE_SOLUTION_SEMANTIC_MISMATCH";

                issues.push({
                    code,
                    category: "tests",
                    severity: "error",
                    exerciseId: exercise.id,
                    message:
                        run.reason === "semantic_mismatch"
                            ? `Exercise "${exercise.id}" solutionCode does not satisfy its semantic checks.`
                            : `Exercise "${exercise.id}" semantic validation failed: ${run.message}`,
                });
            }

            continue;
        }
        const run = await validateCodeAgainstTests({
            language: exercise.language,
            solutionCode,
            tests: expected.tests,
            files: collectExerciseWorkspaceFiles(exercise),
            limits: { cpu_time_limit: 2, wall_time_limit: 6, memory_limit: 256000 },
            ...(sharedCodeRunner ? { runner: sharedCodeRunner } : {}),
        });
        if (!run.ok) {
            const code =
                run.reason === "runner_unavailable"
                    ? "CODE_PROFILE_SOLUTION_RUNNER_UNAVAILABLE"
                    : run.reason === "execution_failed"
                        ? "CODE_PROFILE_SOLUTION_EXECUTION_FAILED"
                        : "CODE_PROFILE_SOLUTION_OUTPUT_MISMATCH";

            issues.push({
                code,
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    run.reason === "output_mismatch"
                        ? `Exercise "${exercise.id}" solutionCode does not satisfy its published tests.`
                        : `Exercise "${exercise.id}" solutionCode could not be validated against its published tests: ${run.message}`,
            });
        }
    }

    return issues;
}
