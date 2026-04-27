import type {
    ManifestCodeInput,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    buildFixedTestsExpected,
    buildSqlQueryExpected,
    buildTemplateIoExpected,
} from "../base/codeInputExpected.js";
import type { GoldenValidationReport } from "./profileServices.js";
import { makeEmptyGoldenValidationReport } from "./noopReports.js";

function validateCodeInputRecipe(
    exercise: ManifestCodeInput,
): string | null {
    try {
        switch (exercise.recipe.type) {
            case "fixed_tests":
                buildFixedTestsExpected(exercise.recipe);
                return null;
            case "template_io":
                buildTemplateIoExpected({ recipe: exercise.recipe });
                return null;
            case "sql_query":
                buildSqlQueryExpected({
                    recipe: exercise.recipe,
                    fixedSqlDialect: exercise.fixedSqlDialect,
                });
                return null;
            default:
                return `Unsupported code_input recipe type "${String((exercise.recipe as { type?: unknown }).type ?? "")}".`;
        }
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

    report.ok = !report.issues.some((issue) => issue.severity === "error");
    return report;
}
