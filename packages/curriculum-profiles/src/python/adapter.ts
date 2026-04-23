import type {
    TopicRecipe,
    BuildSubjectManifestArgs,
    BuildTopicSeedArgs,
    CompileTopicRecipeArgs,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type { CourseProfileAdapter } from "../types.js";
import { pythonProfile } from "./profile.js";

export const pythonProfileAdapter: CourseProfileAdapter = {
    id: "python",

    buildTopicSeed(args: BuildTopicSeedArgs) {
        const moduleRuntimeDefaults: TopicSeed["moduleRuntimeDefaults"] =
            args.module.runtimeDefaults ??
            pythonProfile.buildModuleRuntimeDefaults();

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
            moduleRuntimeDefaults,
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

    buildSubjectManifest(args: BuildSubjectManifestArgs) {
        return buildBaseSubjectManifest(
            args.blueprint,
            args.modules,
            () => pythonProfile.buildModuleRuntimeDefaults(),
        );
    },
};