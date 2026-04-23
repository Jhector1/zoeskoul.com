import type {
    TopicRecipe,
    BuildSubjectManifestArgs,
    BuildTopicSeedArgs,
    CompileTopicRecipeArgs,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type { CourseProfileAdapter } from "../types.js";
import { getSqlDatasetById } from "./datasets/index.js";
import { sqlProfile } from "./profile.js";

export { getSqlDatasetById, listSqlDatasetIds } from "./datasets/index.js";

export const sqlProfileAdapter: CourseProfileAdapter = {
    id: "sql",

    buildTopicSeed(args: BuildTopicSeedArgs) {
        const moduleOrder =
            typeof args.module.order === "number" ? args.module.order - 1 : 0;

        const moduleRuntimeDefaults: TopicSeed["moduleRuntimeDefaults"] =
            args.module.runtimeDefaults ??
            sqlProfile.buildModuleRuntimeDefaults(moduleOrder);

        const moduleDataset =
            moduleRuntimeDefaults?.kind === "sql" && moduleRuntimeDefaults.datasetId
                ? getSqlDatasetById(moduleRuntimeDefaults.datasetId)
                : null;

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
            moduleDataset,
            sectionTitle: args.section.title,
            sourceLocale: args.blueprint.sourceLocale,
            targetLocales: args.blueprint.targetLocales,
        };
    },

    validateTopicRecipe(recipe: TopicRecipe) {
        return sqlProfile.validateTopicBundle(recipe.topicBundle);
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
            (module: { order: number }) =>
                sqlProfile.buildModuleRuntimeDefaults(Math.max(0, module.order - 1)),
        );
    },
};