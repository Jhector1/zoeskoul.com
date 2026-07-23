import type { SubjectShapePack } from "./types.js";
import { makeKeyPatterns } from "./sharedKeyPatterns.js";
import { sharedFilesystem } from "./sharedFilesystem.js";

export const cShape: SubjectShapePack = {
    profileId: "c",
    subjectManifest: {
        genKey: "c_course",
        moduleSlug: (order) => `c-${order}`,
        modulePrefix: (order) => `c${order}`,
        sectionSlug: (moduleOrder, sectionOrder) =>
            `c-${moduleOrder}-compiled-lab-${sectionOrder}`,
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
        allowedSketchArchetypes: ["paragraph", "algorithm_animation"],
        allowedExerciseKinds: [
            "single_choice",
            "multi_choice",
            "drag_reorder",
            "fill_blank_choice",
            "code_input",
        ],
    },
    messages: { logicalNamespaces: ["topics", "sketches", "quiz"] },
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
        singleChoice: { requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "optionIds", "expected"] },
        multiChoice: { requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "optionIds", "expected"] },
        dragReorder: { requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "tokenIds", "expected"] },
        fillBlankChoice: { requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "choiceCount", "expected"] },
    },
    aiContract: {
        description: "C draft content compiles into multi-file C topic bundles with runnable fixed tests.",
        rules: [
            "Use existing C key namespaces.",
            "Use paragraph or algorithm_animation sketches.",
            "Before every algorithm_animation, add a paragraph sketch that states the exact problem, translates it into plain English, lists the constraints, and tells the learner what to watch for.",
            "Give every algorithm_animation a contextKey so the question and the animation goal remain visible while the learner steps through it.",
            "Place the matching single-step project card immediately after its problem sketch and animation; do not group unrelated animations before all exercises.",
            "Use code_input with fixed_tests for C implementation tasks.",
            "Provide main.c, headers, implementation files, and complete solutionFiles explicitly.",
        ],
        doNotGenerate: [
            "subject.manifest.json directly",
            "topic.bundle.json directly",
            "topics.generated.ts directly",
            "filesystem paths outside the authored workspace",
        ],
    },
};
