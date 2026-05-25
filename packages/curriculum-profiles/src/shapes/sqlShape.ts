import type { SubjectShapePack } from "./types.js";
import { makeKeyPatterns } from "./sharedKeyPatterns.js";
import { sharedFilesystem } from "./sharedFilesystem.js";
import { listSqlDatasetIds } from "../sql/datasets/index.js";

export const sqlShape: SubjectShapePack = {
    profileId: "sql",

    subjectManifest: {
        genKey: "sql_for_beginners",
        moduleSlug: (order) => `sql_module_${order}`,
        modulePrefix: (order) => `sql${order}`,
        sectionSlug: (moduleOrder, sectionOrder) => `section_${moduleOrder}_${sectionOrder}`,
        accessPolicyDefault: "free",
        statusDefault: "active",
        completionPolicy: {
            requireAllPublishedModules: true,
            rewardEnabledByDefault: true,
            certificateEnabledByDefault: true,
        },
        keyPatterns: makeKeyPatterns(),
    },

    topicBundle: {
        requiredTopLevelFields: [
            "topicId",
            "subjectSlug",
            "moduleSlug",
            "sectionSlug",
            "prefix",
            "minutes",
            "topic",
            "cards",
            "sketches",
            "exercises",
        ],
        topicFields: ["labelKey", "summaryKey"],
        allowedCardKinds: ["sketch", "project", "quiz"],
        allowedSketchArchetypes: ["paragraph"],
        allowedExerciseKinds: [
            "single_choice",
            "multi_choice",
            "drag_reorder",
            "fill_blank_choice",
            "code_input",
        ],
    },

    messages: {
        logicalNamespaces: ["topics", "sketches", "quiz"],
    },

    filesystem: sharedFilesystem,

    project: {
        cardKind: "project",
        projectFields: ["difficulty", "allowReveal", "preferKind", "maxAttempts", "steps"],
        projectStepFields: [
            "id",
            "titleKey",
            "exerciseKey",
            "difficulty",
            "preferKind",
            "seedPolicy",
            "maxAttempts",
        ],
    },

    quiz: {
        singleChoice: {
            requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "optionIds", "expected"],
        },
        multiChoice: {
            requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "optionIds", "expected"],
        },
        dragReorder: {
            requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "tokenIds", "expected"],
        },
        fillBlankChoice: {
            requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "choiceCount", "expected"],
        },
    },

    sqlCodeRecipe: {
        kind: "code_input",
        language: "sql",
        fixedSqlDialect: "sqlite",
        recipeType: "sql_query",
        requiredRecipeFields: ["type", "datasetId", "resultShape", "solutionCode"],
        allowedDatasetIds: listSqlDatasetIds(),
    },

    aiContract: {
        description:
            "SQL draft content compiles into real SQL topic bundles and message files.",
        rules: [
            "Use existing SQL key namespaces.",
            "Use only approved SQL datasets.",
            "Use only sketch/project/quiz cards.",
            "Use paragraph sketches.",
            "Use code_input with sql_query recipe for SQL execution tasks.",
        ],
        doNotGenerate: [
            "subject.manifest.json directly",
            "topic.bundle.json directly",
            "topics.generated.ts directly",
            "filesystem paths directly",
        ],
    },
};
