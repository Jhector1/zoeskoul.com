import type {
  TopicRecipe,
  BuildSubjectManifestArgs,
  BuildTopicSeedArgs,
  CompileTopicRecipeArgs,
} from "@zoeskoul/curriculum-contracts";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type { CourseProfile, CourseProfileAdapter } from "../types.js";

export const languageProfile: CourseProfile = {
  id: "language",
  allowedExerciseKinds: [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
  ],
  allowedRecipeTypes: ["fixed_tests", "template_io"],
  buildModuleRuntimeDefaults() {
    return null;
  },
  getRecipeRegistry() {
    return {};
  },
  validateTopicBundle() {
    return [];
  },
};

export const languageProfileAdapter: CourseProfileAdapter = {
  id: "language",
  buildTopicSeed(args: BuildTopicSeedArgs) {
    return {
      subjectSlug: args.blueprint.subjectSlug,
      profileId: args.blueprint.profileId,
      moduleSlug: args.module.slug,
      sectionSlug: args.section.slug,
      topicId: args.topic.topicId,
      order: args.topic.order,
      title: args.topic.title,
      summary: args.topic.summary,
      minutes: args.topic.minutes,
      moduleTitle: args.module.title,
      modulePurpose: args.module.purpose,
      moduleObjectives: args.module.learningObjectives,
      guidedExercises: args.module.guidedExercises,
      quizFocus: args.module.quizFocus,
      moduleProject: args.module.moduleProject,
      sectionTitle: args.section.title,
      sourceLocale: args.blueprint.sourceLocale,
      targetLocales: args.blueprint.targetLocales,
    };
  },
  validateTopicRecipe(_recipe: TopicRecipe) {
    return [];
  },
  compileTopicRecipe(args: CompileTopicRecipeArgs) {
    return {
      topicBundle: args.recipe.topicBundle,
      messagesByLocale: args.recipe.messagesByLocale,
    };
  },
  buildSubjectManifest(args) {
    return buildBaseSubjectManifest(
        args.blueprint,
        args.modules,
        () => languageProfile.buildModuleRuntimeDefaults(),
    );
  },
};