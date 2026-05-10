import type { CourseProfile } from "../types.js";
import type { PlannedModule } from "@zoeskoul/curriculum-contracts";
import { buildSqlQueryRecipe } from "./recipes/buildSqlQueryRecipe.js";
import { resolveSqlRuntimeDefaults } from "./runtimeDefaults.js";

export { getSqlModuleDataset, getSqlModuleDatasetPolicy } from "./datasetPolicy.js";

export const sqlProfile: CourseProfile = {
    id: "sql",
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["fixed_tests", "template_io", "sql_query"],

    buildModuleRuntimeDefaults(moduleOrder?: number, module?: PlannedModule) {
        return resolveSqlRuntimeDefaults({
            moduleOrder,
            module,
        });
    },

    getRecipeRegistry() {
        return { sql_query: buildSqlQueryRecipe };
    },

    validateTopicBundle(bundle) {
        if (!bundle || typeof bundle !== "object") {
            return ["ERROR: topicBundle is missing or invalid"];
        }

        if (!Array.isArray(bundle.cards)) {
            return ["ERROR: topicBundle.cards must be an array"];
        }

        if (!Array.isArray(bundle.sketches)) {
            return ["ERROR: topicBundle.sketches must be an array"];
        }

        if (!Array.isArray(bundle.exercises)) {
            return ["ERROR: topicBundle.exercises must be an array"];
        }

        const issues: string[] = [];
        for (const ex of bundle.exercises) {
            if (
                ex?.kind === "code_input" &&
                ex?.recipe?.type === "sql_query" &&
                !ex?.recipe?.datasetId
            ) {
                issues.push(`ERROR: Exercise ${ex.id} is missing datasetId`);
            }
        }

        return issues;
    },
};