import type { SubjectShapePack } from "./types.js";
import { makeKeyPatterns } from "./sharedKeyPatterns.js";
import { sharedFilesystem } from "./sharedFilesystem.js";

export const languageShape: SubjectShapePack = {
    profileId: "language",

    subjectManifest: {
        genKey: "language_course",
        moduleSlug: (order) => `language-${order}`,
        modulePrefix: (order) => `lang${order}`,
        sectionSlug: (moduleOrder, sectionOrder) =>
            `language-${moduleOrder}-integrated-skills-${sectionOrder}`,
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
        allowedSketchArchetypes: ["paragraph", "image"],
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
        textInput: {
            requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "expected"],
        },
        voiceInput: {
            requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "targetText", "expected"],
        },
        wordBankArrange: {
            requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "targetText", "expected"],
        },
        listenBuild: {
            requiredFields: ["id", "kind", "purpose", "weight", "messageBase", "targetText", "expected"],
        },
    },

    aiContract: {
        description:
            "Language draft content compiles into integrated listening, speaking, reading, writing, vocabulary, grammar, conversation, and culture practice.",
        rules: [
            "Use the language profile exercise kinds instead of code workspaces.",
            "Use explicit locale metadata for listening and speaking exercises.",
            "Treat voice_input as transcript-based speaking practice, not phoneme-level pronunciation scoring.",
            "Keep accepted language variants explicit with anyOf instead of silently rewriting learner language.",
            "Use paragraph or image lesson sketches and standard sketch/project/quiz cards.",
        ],
        doNotGenerate: [
            "subject.manifest.json directly",
            "topic.bundle.json directly",
            "topics.generated.ts directly",
            "filesystem paths directly",
            "code_input exercises",
        ],
    },
};
