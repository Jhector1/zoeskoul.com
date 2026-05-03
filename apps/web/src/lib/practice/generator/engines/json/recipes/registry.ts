import type { RecipeHandler } from "./types";
import { buildFixedTestsRecipe } from "./fixedTests";
import { buildSqlQueryRecipe } from "./sqlQuery";
import { buildTemplateIoRecipe } from "./templateIo";
import {ManifestRecipe} from "@zoeskoul/curriculum-contracts";

export const RECIPE_REGISTRY: Record<ManifestRecipe["type"], RecipeHandler<any>> = {
    fixed_tests: buildFixedTestsRecipe,
    sql_query: buildSqlQueryRecipe,
    template_io: buildTemplateIoRecipe,
};