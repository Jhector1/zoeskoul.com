import type {
    ManifestCodeInput,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    buildCodeInputExpected,
} from "../base/codeInputExpected.js";
import { getSqlDatasetById } from "../sql/datasets/index.js";
import type { GoldenValidationReport } from "./profileServices.js";
import { makeEmptyGoldenValidationReport } from "./noopReports.js";
import { resolveEffectiveExerciseRuntime } from "@zoeskoul/curriculum-runtime/runtime";
import { resolveSqlRunner, validateSqlAgainstSolution } from "@zoeskoul/curriculum-runtime/sql";

function formatSqlContext(args: {
    subjectSlug: string;
    courseSlug?: string;
    topicId: string;
    datasetId?: string;
}) {
    const parts = [
        `subject "${args.subjectSlug}"`,
        args.courseSlug ? `course "${args.courseSlug}"` : null,
        `topic "${args.topicId}"`,
        args.datasetId ? `dataset "${args.datasetId}"` : null,
    ].filter(Boolean);

    return parts.join(", ");
}

function validateCodeInputRecipe(
    exercise: ManifestCodeInput,
): string | null {
    try {
        buildCodeInputExpected(exercise);
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : "Unknown golden validation failure.";
    }
}

function withResolvedSqlDatasetId(args: {
    exercise: ManifestCodeInput;
    topicBundle: TopicBundleManifest;
    seed: TopicSeed;
}) {
    if (args.exercise.recipe.type !== "sql_query") return args.exercise;
    if (args.exercise.recipe.datasetId?.trim()) return args.exercise;

    const effectiveRuntime = resolveEffectiveExerciseRuntime({
        language: "sql",
        recipe: args.exercise.recipe,
        topicRuntimeDefaults: args.topicBundle.runtimeDefaults ?? null,
        moduleRuntimeDefaults: args.seed.moduleRuntimeDefaults ?? null,
    });

    if (!effectiveRuntime.datasetId) return args.exercise;

    return {
        ...args.exercise,
        recipe: {
            ...args.exercise.recipe,
            datasetId: effectiveRuntime.datasetId,
        },
    };
}

export async function validateGoldenTopicBundle(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    topicBundle: TopicBundleManifest;
}): Promise<GoldenValidationReport> {
    const report = makeEmptyGoldenValidationReport(args.seed.topicId);

    for (const exercise of args.topicBundle.exercises) {
        if (exercise.kind !== "code_input") continue;

        const resolvedExercise = withResolvedSqlDatasetId({
            exercise,
            topicBundle: args.topicBundle,
            seed: args.seed,
        });
        const recipeError = validateCodeInputRecipe(resolvedExercise);
        if (!recipeError) continue;

        report.issues.push({
            code: "GOLDEN_RECIPE_BUILD_FAILED",
            category: "recipe",
            severity: "error",
            exerciseId: exercise.id,
            message: `Exercise "${exercise.id}" failed shared golden recipe validation: ${recipeError}`,
        });
    }

    const runSql = resolveSqlRunner();

    for (const exercise of args.topicBundle.exercises) {
        if (exercise.kind !== "code_input") continue;
        if (exercise.recipe.type !== "sql_query") continue;

        const resolvedExercise = withResolvedSqlDatasetId({
            exercise,
            topicBundle: args.topicBundle,
            seed: args.seed,
        });
        let expected;
        try {
            expected = buildCodeInputExpected(resolvedExercise);
        } catch {
            continue;
        }

        if (expected.strategy !== "sql") continue;
        const firstTest = expected.tests[0];
        const effectiveRuntime = resolveEffectiveExerciseRuntime({
            language: "sql",
            recipe: exercise.recipe,
            topicRuntimeDefaults: args.topicBundle.runtimeDefaults ?? null,
            moduleRuntimeDefaults: args.seed.moduleRuntimeDefaults ?? null,
        });
        const datasetId =
            firstTest?.runtime?.datasetId ??
            expected.runtime?.datasetId ??
            effectiveRuntime.datasetId;
        const dataset = datasetId ? getSqlDatasetById(datasetId) : null;

        if (!runSql) {
            report.issues.push({
                code: "GOLDEN_SQL_RUNNER_UNAVAILABLE",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" could not validate its SQL solution because no SQL runner is available for ${formatSqlContext({
                        subjectSlug: args.seed.subjectSlug,
                        courseSlug: args.seed.courseSlug,
                        topicId: args.seed.topicId,
                        datasetId,
                    })}. Configure a SQL runner or ensure the local SQLite runner dependencies are available.`,
            });
            continue;
        }
        const result = await validateSqlAgainstSolution({
            learnerSql: expected.solutionCode ?? "",
            solutionSql: expected.solutionCode ?? "",
            checkSql: firstTest?.checkSql,
            dialect:
                firstTest?.sqlDialect ??
                expected.fixedSqlDialect ??
                effectiveRuntime.fixedSqlDialect ??
                "sqlite",
            schemaSql: firstTest?.schemaSql ?? expected.schemaSql ?? dataset?.schemaSql,
            seedSql: firstTest?.seedSql ?? expected.seedSql ?? dataset?.seedSql,
            datasetId,
            ignoreRowOrder: firstTest?.ignoreRowOrder ?? false,
            runSql,
        });

        if (result.ok) continue;

        report.issues.push({
            code: "GOLDEN_SQL_SOLUTION_MISMATCH",
            category: "tests",
            severity: "error",
            exerciseId: exercise.id,
            message: `Exercise "${exercise.id}" SQL solution does not satisfy its published SQL contract: ${result.message ?? result.errorStage ?? "unknown error"}`,
        });
    }

    report.ok = !report.issues.some((issue) => issue.severity === "error");
    return report;
}
