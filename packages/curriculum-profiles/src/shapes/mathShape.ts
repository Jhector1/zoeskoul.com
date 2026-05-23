import type { SubjectShapePack } from "./types.js";
import { makeKeyPatterns } from "./sharedKeyPatterns.js";
import { sharedFilesystem } from "./sharedFilesystem.js";

export const mathShape: SubjectShapePack = {
    profileId: "math",

    subjectManifest: {
        genKey: "math_part1",
        moduleSlug: (order) => `math-${order}`,
        modulePrefix: (order) => `math${order}`,
        sectionSlug: (moduleOrder, sectionOrder) =>
            `math-${moduleOrder}-core-concepts-${sectionOrder}`,
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

    aiContract: {
        description:
            "Math draft content compiles into concept-focused topic bundles and message files.",
        rules: [
            "Use existing math key namespaces.",
            "Use only sketch/project/quiz cards.",
            "Use paragraph sketches.",
            "Keep exercises concept-focused unless the profile explicitly adds new capabilities.",
        ],
        doNotGenerate: [
            "subject.manifest.json directly",
            "topic.bundle.json directly",
            "topics.generated.ts directly",
            "filesystem paths directly",
        ],
    },
};
