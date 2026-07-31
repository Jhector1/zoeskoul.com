import type { ManifestRecipe } from "@/lib/subjects/_core/manifestTypes";
import type { RecipeHandler } from "./types";
import { buildFixedTestsRecipe } from "./fixedTests";
import { buildSemanticRecipe } from "./semantic";
import { buildShellTaskRecipe } from "./shellTask";
import { buildSqlQueryRecipe } from "./sqlQuery";
import { buildTemplateIoRecipe } from "./templateIo";

export const RECIPE_REGISTRY: Record<ManifestRecipe["type"], RecipeHandler<any>> = {
    fixed_tests: buildFixedTestsRecipe,
    semantic: buildSemanticRecipe,
    shell_task: buildShellTaskRecipe,
    sql_query: buildSqlQueryRecipe,
    template_io: buildTemplateIoRecipe,
};
