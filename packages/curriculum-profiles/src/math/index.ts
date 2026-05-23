import type {
  TopicRecipe,
  BuildSubjectManifestArgs,
  BuildTopicSeedArgs,
  CompileTopicRecipeArgs,
} from "@zoeskoul/curriculum-contracts";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type { CourseProfile, CourseProfileAdapter } from "../types.js";
import { mathShape } from "../shapes/mathShape.js";

export const mathProfile: CourseProfile = {
  id: "math",
  shape: mathShape,
  allowedExerciseKinds: [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
  ],
  allowedRecipeTypes: ["fixed_tests", "template_io"],
  qualityPolicy: {
    conceptOnly: true,
    repeatedExerciseTextThreshold: 2,
  },
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

export const mathProfileAdapter: CourseProfileAdapter = {
  id: "math",
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
      moduleObjectives: args.module.learningObjectives ?? [],
      guidedExercises: args.module.guidedExercises ?? [],
      quizFocus: args.module.quizFocus ?? [],
      moduleProject:
          typeof args.module.moduleProject === "string"
              ? args.module.moduleProject
              : undefined,
      sectionTitle: args.section.title,
      sourceLocale: args.blueprint.sourceLocale,
      targetLocales: args.blueprint.targetLocales ?? [],
      exercisePolicy: args.module.exercisePolicy,
      modulePrefix: args.module.prefix,
      moduleOrder: args.module.order,
      sectionOrder: args.section.order,
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
  buildSubjectManifest(args: BuildSubjectManifestArgs) {
    return buildBaseSubjectManifest(
        args.blueprint,
        args.modules,
        () => mathProfile.buildModuleRuntimeDefaults(),
    );
  },
};
