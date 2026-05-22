import type {
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
    exercise: TopicBundleManifest["exercises"][number],
): string | null {
    try {
        if (exercise.kind !== "code_input") return null;
        buildCodeInputExpected(exercise);
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : "Unknown golden validation failure.";
    }
}

export async function validateGoldenTopicBundle(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    topicBundle: TopicBundleManifest;
}): Promise<GoldenValidationReport> {
    const report = makeEmptyGoldenValidationReport(args.seed.topicId);

    for (const exercise of args.topicBundle.exercises) {
        if (exercise.kind !== "code_input") continue;

        const recipeError = validateCodeInputRecipe(exercise);
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

        let expected;
        try {
            expected = buildCodeInputExpected(exercise);
        } catch {
            continue;
        }

        if (expected.strategy !== "sql") continue;
        const firstTest = expected.tests[0];
        const datasetId = firstTest?.runtime?.datasetId ?? expected.runtime?.datasetId;
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
            dialect: firstTest?.sqlDialect ?? expected.fixedSqlDialect ?? "sqlite",
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
