import type {
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    buildCodeInputExpected,
} from "../base/codeInputExpected.js";
import type { GoldenValidationReport } from "./profileServices.js";
import { makeEmptyGoldenValidationReport } from "./noopReports.js";
import { getSqlRunner, validateSqlAgainstSolution } from "@zoeskoul/curriculum-runtime/sql";

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

    const runSql = getSqlRunner();

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

        if (!runSql) {
            report.issues.push({
                code: "GOLDEN_SQL_RUNNER_UNAVAILABLE",
                category: "tests",
                severity: "error",
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" could not validate its SQL solution because no SQL runner is configured.`,
            });
            continue;
        }

        const firstTest = expected.tests[0];
        const result = await validateSqlAgainstSolution({
            learnerSql: expected.solutionCode ?? "",
            solutionSql: expected.solutionCode ?? "",
            checkSql: firstTest?.checkSql,
            dialect: firstTest?.sqlDialect ?? expected.fixedSqlDialect ?? "sqlite",
            schemaSql: firstTest?.schemaSql ?? expected.schemaSql,
            seedSql: firstTest?.seedSql ?? expected.seedSql,
            datasetId: firstTest?.runtime?.datasetId ?? expected.runtime?.datasetId,
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
