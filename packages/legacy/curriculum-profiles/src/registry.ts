import type { CourseProfile, RecipeHandler } from "./types.js";
import { buildFixedTestsRecipe } from "./base/recipes/buildFixedTestsRecipe.js";
import { buildTemplateIoRecipe } from "./base/recipes/buildTemplateIoRecipe.js";
import { sqlProfile } from "./sql/index.js";
import { sql2Profile } from "./sql2/index.js";
import { pythonProfile } from "./python/index.js";
import { mathProfile } from "./math/index.js";
import { languageProfile } from "./language/index.js";
import { webProfile } from "./web/index.js";

const profiles = [
    sqlProfile,
    sql2Profile,
    pythonProfile,
    mathProfile,
    languageProfile,
    webProfile,
] satisfies CourseProfile[];

export const PROFILE_REGISTRY = Object.fromEntries(
    profiles.map((p) => [p.id, p]),
) as Record<string, CourseProfile>;

export const BASE_RECIPE_REGISTRY: Record<string, RecipeHandler<any>> = {
    fixed_tests: buildFixedTestsRecipe,
    template_io: buildTemplateIoRecipe,
};

export function getProfile(id: string): CourseProfile {
    const profile = PROFILE_REGISTRY[id];
    if (!profile) throw new Error(`Unknown course profile: ${id}`);
    return profile;
}

export function getRecipeRegistryForProfile(id: string) {
    const profile = getProfile(id);
    return {
        ...BASE_RECIPE_REGISTRY,
        ...profile.getRecipeRegistry(),
    };
}