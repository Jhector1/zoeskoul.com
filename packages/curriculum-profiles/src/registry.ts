import type { CourseProfile, CourseProfileAdapter, RecipeHandler } from "./types.js";
import { buildFixedTestsRecipe } from "./base/recipes/buildFixedTestsRecipe.js";
import { buildSemanticRecipe } from "./base/recipes/buildSemanticRecipe.js";
import { buildTemplateIoRecipe } from "./base/recipes/buildTemplateIoRecipe.js";
import { sqlProfile, sqlProfileAdapter } from "./sql/index.js";
import { pythonProfile, pythonProfileAdapter } from "./python/index.js";
import { mathProfile, mathProfileAdapter } from "./math/index.js";
// import { languageProfile, languageProfileAdapter } from "./language/index.js";
// import { webProfile, webProfileAdapter } from "./web/index.js";
// import { dataScienceProfile, dataScienceProfileAdapter } from "./data-science/index.js";

const profiles = [sqlProfile, pythonProfile, mathProfile,
  // languageProfile, webProfile, dataScienceProfile
] satisfies CourseProfile[];
const adapters = [sqlProfileAdapter, pythonProfileAdapter, mathProfileAdapter,
  // languageProfileAdapter, webProfileAdapter, dataScienceProfileAdapter
] satisfies CourseProfileAdapter[];

export const PROFILE_REGISTRY = Object.fromEntries(profiles.map((p) => [p.id, p])) as Record<string, CourseProfile>;
export const PROFILE_ADAPTER_REGISTRY = Object.fromEntries(adapters.map((p) => [p.id, p])) as Record<string, CourseProfileAdapter>;

export const BASE_RECIPE_REGISTRY: Record<string, RecipeHandler> = {  fixed_tests: buildFixedTestsRecipe,
  semantic: buildSemanticRecipe,
  template_io: buildTemplateIoRecipe,
};

export function getProfile(id: string): CourseProfile {
  const profile = PROFILE_REGISTRY[id];
  if (!profile) throw new Error(`Unknown course profile: ${id}`);
  return profile;
}

export function getProfileAdapter(id: string): CourseProfileAdapter {
  const adapter = PROFILE_ADAPTER_REGISTRY[id];
  if (!adapter) throw new Error(`Unknown profile adapter: ${id}`);
  return adapter;
}

export function getRecipeRegistryForProfile(id: string) {
  const profile = getProfile(id);
  return {
    ...BASE_RECIPE_REGISTRY,
    ...profile.getRecipeRegistry(),
  };
}
