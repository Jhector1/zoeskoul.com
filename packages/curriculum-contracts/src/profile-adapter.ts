import type { CourseBlueprint } from "./blueprint.js";
import type { PlannedModule } from "./plan.js";
import type { SubjectManifest } from "./subject-manifest.js";
import type { TopicRecipe } from "./topic-recipe.js";
import type { TopicSeed } from "./topic-seed.js";
import type { ResolvedExercisePolicy } from "./exercise-policy.js";

export type BuildTopicSeedArgs = {
  blueprint: CourseBlueprint;
  module: {
    slug: string;
    prefix: string;
    title: string;
    order: number;
    purpose?: TopicSeed["modulePurpose"];
    learningObjectives?: TopicSeed["moduleObjectives"];
    guidedExercises?: TopicSeed["guidedExercises"];
    quizFocus?: TopicSeed["quizFocus"];
    moduleProject?: TopicSeed["moduleProject"];
    runtimeDefaults?: TopicSeed["moduleRuntimeDefaults"];
    exercisePolicy?: ResolvedExercisePolicy;
  };
  section: {
    slug: string;
    title: string;
    order: number;
  };
  topic: {
    topicId: string;
    order: number;
    title: string;
    summary: string;
    minutes: number;
    technical?: boolean;
  };
};

export type CompileTopicRecipeArgs = {
  seed?: TopicSeed;
  recipe: TopicRecipe;
};

export type BuildSubjectManifestArgs = {
  blueprint: CourseBlueprint;
  modules: PlannedModule[];
};

export type ProfileAdapter = {
  id: string;
  buildTopicSeed(args: BuildTopicSeedArgs): TopicSeed;
  validateTopicRecipe(recipe: TopicRecipe): string[];
  compileTopicRecipe(args: CompileTopicRecipeArgs): TopicRecipe;
  buildSubjectManifest(args: BuildSubjectManifestArgs): SubjectManifest;
  getTopicSeedRuntimeDefaults?: (args: {
    blueprint: CourseBlueprint;
    module: {
      slug: string;
      order: number;
    };
  }) => TopicSeed["moduleRuntimeDefaults"] | null;
};
