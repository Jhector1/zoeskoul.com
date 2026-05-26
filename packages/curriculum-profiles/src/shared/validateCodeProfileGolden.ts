import type {
    ManifestCodeInput,
    ManifestFileFixture,
    ManifestStarterFiles,
    TopicBundleManifest,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";
import {
    validateCodeAgainstTests,
    validateSemanticCode,
} from "@zoeskoul/curriculum-runtime";
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

function collectExerciseWorkspaceFiles(
    exercise: ManifestCodeInput,
): Array<{ path: string; content: string }> {
    const merged = new Map<string, string>();
    const sources = [
        exercise.workspace?.files,
        exercise.workspace?.initialFiles,
        exercise.workspace?.workspaceFiles,
        exercise.workspace?.starterFiles,
        exercise.starterFiles,
    ];

    for (const source of sources) {
        for (const file of normalizeWorkspaceFiles(source)) {
            if (!merged.has(file.path)) {
                merged.set(file.path, file.content);
            }
        }
    }

    return [...merged.entries()].map(([path, content]) => ({ path, content }));
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

export async function validateCodeProfileGolden(args: {
    profileId: string;
    expectedLanguage: Exclude<WorkspaceLanguage, "sql">;
    allowedRecipeTypes: Array<ManifestCodeInput["recipe"]["type"]>;
    topicBundle: TopicBundleManifest;
}): Promise<GoldenValidationIssue[]> {
    const issues: GoldenValidationIssue[] = [];

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

    for (const exercise of args.topicBundle.exercises) {
        if (exercise.kind !== "code_input") continue;

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

        const expected = buildCodeInputExpected(exercise);
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
            const run = await validateSemanticCode({
                language: exercise.language,
                solutionCode,
                expected,
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
            limits: { timeoutMs: 4000 },
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
