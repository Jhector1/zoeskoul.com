import type {
    ManifestCodeInput,
    TopicBundleManifest,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";
import type { GoldenValidationIssue } from "./profileServices.js";

export function validateCodeProfileGolden(args: {
    profileId: string;
    expectedLanguage: Exclude<WorkspaceLanguage, "sql">;
    allowedRecipeTypes: Array<ManifestCodeInput["recipe"]["type"]>;
    topicBundle: TopicBundleManifest;
}): GoldenValidationIssue[] {
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
    }

    return issues;
}
