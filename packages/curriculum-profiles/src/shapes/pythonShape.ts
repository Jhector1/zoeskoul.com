import type { SubjectShapePack } from "./types.js";
import { makeKeyPatterns } from "./sharedKeyPatterns.js";
import { sharedFilesystem } from "./sharedFilesystem.js";

export const pythonShape: SubjectShapePack = {
    profileId: "python",

    subjectManifest: {
        genKey: "python_part1",
        moduleSlug: (order) => `python-${order}`,
        modulePrefix: (order) => `py${order}`,
        sectionSlug: (moduleOrder, sectionOrder) =>
            `python-${moduleOrder}-core-building-blocks-${sectionOrder}`,
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

    pythonCodeRecipe: {
        kind: "code_input",
        language: "python",
        recipeTypes: ["template_io", "fixed_tests"],
        templateIoRequiredFields: ["type", "vars", "tests", "solutionTemplate"],
        fixedTestsRequiredFields: ["type", "tests", "solutionCode"],
    },

    aiContract: {
        description:
            "Python draft content compiles into real Python topic bundles and message files.",
        rules: [
            "Use existing Python key namespaces.",
            "Use only sketch/project/quiz cards.",
            "Use paragraph sketches.",
            "Use code_input with template_io or fixed_tests recipes for Python tasks.",
        ],
        doNotGenerate: [
            "subject.manifest.json directly",
            "topic.bundle.json directly",
            "topics.generated.ts directly",
            "filesystem paths directly",
        ],
    },
};
