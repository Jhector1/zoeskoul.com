import type {
    BuildTopicSeedArgs,
    BuildSubjectManifestArgs,
    CompileTopicRecipeArgs,
    TopicRecipe,
} from "@zoeskoul/curriculum-contracts";
import type { SqlDatasetArtifact } from "@zoeskoul/curriculum-contracts";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type { CourseProfileAdapter } from "../types.js";
import { sqlProfile } from "./profile.js";
import { getSqlDatasetById } from "./datasets/index.js";
import { getSqlModuleDatasetPolicy } from "./datasetPolicy.js";

function buildSqlGrounding(args: {
    dataset: SqlDatasetArtifact | null;
    datasetId?: string;
    moduleOrder: number;
}) {
    const policy = getSqlModuleDatasetPolicy(args.moduleOrder);

    const datasetId = args.datasetId ?? args.dataset?.id ?? policy.datasetId;
    const allowedTables = Object.fromEntries(
        Object.entries(args.dataset?.tableSnapshots ?? {}).map(([tableName, table]) => [
            tableName,
            table.columns.map((column) => column.name),
        ]),
    );

    return {
        defaultDatasetId: datasetId,
        preferredTeachingTable:
            policy.preferredTeachingTable ??
            Object.keys(args.dataset?.tableSnapshots ?? {})[0],
        preferredLabelColumn: policy.preferredLabelColumn,
        preferredNumericColumns: policy.preferredNumericColumns ?? [],
        allowedTables,
    };
}

export const sqlProfileAdapter: CourseProfileAdapter = {
    id: "sql",

    getTopicSeedRuntimeDefaults(args) {
        return sqlProfile.buildModuleRuntimeDefaults(args.module.order);
    },

    buildTopicSeed(args: BuildTopicSeedArgs) {
        const fallbackRuntimeDefaults =
            sqlProfile.buildModuleRuntimeDefaults(args.module.order) ?? undefined;

        const moduleRuntimeDefaults =
            args.module.runtimeDefaults ?? fallbackRuntimeDefaults ?? undefined;

        const moduleDatasetId =
            moduleRuntimeDefaults &&
            typeof moduleRuntimeDefaults === "object" &&
            "kind" in moduleRuntimeDefaults &&
            moduleRuntimeDefaults.kind === "sql" &&
            "datasetId" in moduleRuntimeDefaults &&
            typeof moduleRuntimeDefaults.datasetId === "string"
                ? moduleRuntimeDefaults.datasetId
                : undefined;

        const moduleDataset = moduleDatasetId
            ? getSqlDatasetById(moduleDatasetId)
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
            moduleObjectives: args.module.learningObjectives ?? [],
            guidedExercises: args.module.guidedExercises ?? [],
            quizFocus: args.module.quizFocus ?? [],
            moduleProject:
                typeof args.module.moduleProject === "string"
                    ? args.module.moduleProject
                    : undefined,
            moduleRuntimeDefaults,
            moduleDataset,
            sqlGrounding: buildSqlGrounding({
                dataset: moduleDataset,
                datasetId: moduleDatasetId,
                moduleOrder: args.module.order,
            }),
            sectionTitle: args.section.title,
            sourceLocale: args.blueprint.sourceLocale,
            targetLocales: args.blueprint.targetLocales ?? [],
            exercisePolicy: args.module.exercisePolicy,
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
            (module) => sqlProfile.buildModuleRuntimeDefaults(module.order, module),
        );
    },
};