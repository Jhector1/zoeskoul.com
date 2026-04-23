import type { CourseProfile } from "../types.js";
import { buildSqlQueryRecipe } from "../sql/recipes/buildSqlQueryRecipe.js";
import { buildSqlTopicBundleFromPlan } from "../sql/expanders/buildSqlTopicBundleFromPlan.js";
import { buildSqlTopicMessagesFromPlan } from "../sql/expanders/buildSqlTopicMessagesFromPlan.js";

export const sql2Profile: CourseProfile = {
    id: "sql2",
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["fixed_tests", "template_io", "sql_query"],
    buildModuleRuntimeDefaults() {
        return {
            kind: "sql",
            datasetId: "products_catalog",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
        };
    },
    getRecipeRegistry() {
        return {
            sql_query: buildSqlQueryRecipe,
        };
    },
    validateTopicBundle(bundle) {
        const issues: string[] = [];

        for (const ex of bundle.exercises) {
            if (
                ex.kind === "code_input" &&
                ex.recipe.type === "sql_query" &&
                !ex.recipe.datasetId
            ) {
                issues.push(`Exercise ${ex.id} is missing datasetId`);
            }
        }

        return issues;
    },
    buildTopicBundleFromPlan(args) {
        return buildSqlTopicBundleFromPlan(args);
    },
    buildTopicMessagesFromPlan(args) {
        return buildSqlTopicMessagesFromPlan(args);
    },
};