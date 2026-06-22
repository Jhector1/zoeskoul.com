import type {
    BuildTopicSeedArgs,
    BuildSubjectManifestArgs,
    CompileTopicRecipeArgs,
    TopicRecipe,
} from "@zoeskoul/curriculum-contracts";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type { CourseProfileAdapter } from "../types.js";
import { bashProfile } from "./profile.js";

export const bashProfileAdapter: CourseProfileAdapter = {
    id: "bash",

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
            technical: args.topic.technical,
            moduleTitle: args.module.title,
            modulePurpose: args.module.purpose,
            moduleObjectives: args.module.learningObjectives ?? [],
            guidedExercises: args.module.guidedExercises ?? [],
            quizFocus: args.module.quizFocus ?? [],
            moduleProject:
                typeof args.module.moduleProject === "string"
                    ? args.module.moduleProject
                    : undefined,
            moduleRuntimeDefaults: args.module.runtimeDefaults ?? undefined,
            sectionTitle: args.section.title,
            sourceLocale: args.blueprint.sourceLocale,
            targetLocales: args.blueprint.targetLocales ?? [],
            exercisePolicy: args.module.exercisePolicy,
            modulePrefix: args.module.prefix,
            moduleOrder: args.module.order,
            sectionOrder: args.section.order,
        };
    },

    validateTopicRecipe(recipe: TopicRecipe) {
        return bashProfile.validateTopicBundle(recipe.topicBundle);
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
            () => bashProfile.buildModuleRuntimeDefaults(),
        );
    },
};
