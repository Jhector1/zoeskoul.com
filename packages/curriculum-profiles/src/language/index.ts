import type {
  TopicRecipe,
  BuildSubjectManifestArgs,
  BuildTopicSeedArgs,
  CompileTopicRecipeArgs,
} from "@zoeskoul/curriculum-contracts";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type { CourseProfile, CourseProfileAdapter } from "../types.js";
import { languageShape } from "../shapes/languageShape.js";

export const languageProfile: CourseProfile = {
  id: "language",
  shape: languageShape,
  allowedExerciseKinds: [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "text_input",
    "voice_input",
    "word_bank_arrange",
    "listen_build",
  ],
  allowedRecipeTypes: [],
  buildModuleRuntimeDefaults() {
    return null;
  },
  renderExerciseKindPromptRules() {
    return [
      "For text_input, provide expectedText and use anyOf only for explicitly accepted alternative answers.",
      "For voice_input, provide targetText and an explicit locale. It is transcript-based speaking practice, not phoneme-level pronunciation scoring.",
      "For word_bank_arrange, provide targetText and optionally wordBank, distractors, ttsText, locale, and explicit anyOf variants.",
      "For listen_build, provide targetText and an explicit locale; optionally provide wordBank, distractors, and explicit anyOf variants.",
      "Do not generate code_input or pseudocode_input for language courses.",
    ];
  },
  renderAuthoringPromptRules() {
    return [
      "Integrate listening, speaking, reading, and writing rather than isolating language skills into separate technical runtimes.",
      "Keep target-language spelling and diacritics intact.",
      "Do not silently expand, contract, translate, or normalize accepted learner phrases; put accepted alternatives in anyOf.",
      "Use locale metadata on speech/listening exercises so runtime speech services can resolve a trusted language profile.",
    ];
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
      () => languageProfile.buildModuleRuntimeDefaults(),
    );
  },
};
