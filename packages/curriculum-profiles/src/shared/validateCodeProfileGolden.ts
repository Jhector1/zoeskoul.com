import type {
    ManifestCodeInput,
    TopicBundleManifest,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";
import { validateCodeAgainstTests } from "@zoeskoul/curriculum-runtime";
import {
    buildFixedTestsExpected,
    buildTemplateIoExpected,
} from "../base/codeInputExpected.js";
import type { GoldenValidationIssue } from "./profileServices.js";

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

        if (
            exercise.language === args.expectedLanguage &&
            (exercise.recipe.type === "fixed_tests" ||
                exercise.recipe.type === "template_io")
        ) {
            const expected =
                exercise.recipe.type === "fixed_tests"
                    ? buildFixedTestsExpected(exercise.recipe)
                    : buildTemplateIoExpected({ recipe: exercise.recipe });

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

            const run = await validateCodeAgainstTests({
                language: exercise.language,
                solutionCode,
                tests: expected.tests.map((test) => ({
                    stdin: "stdin" in test ? test.stdin : undefined,
                    stdout: test.stdout,
                    match: "match" in test ? test.match : "exact",
                })),
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
    }

    return issues;
}
