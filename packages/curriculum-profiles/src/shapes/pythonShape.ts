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
        recipeTypes: ["template_io", "fixed_tests", "semantic"],
        templateIoRequiredFields: ["type", "vars", "tests", "solutionTemplate"],
        fixedTestsRequiredFields: ["type", "tests", "solutionCode"],
        semanticRequiredFields: ["type", "language", "solutionCode", "semanticChecks"],
    },

    aiContract: {
        description:
            "Python draft content compiles into real Python topic bundles and message files.",
        rules: [
            "Use existing Python key namespaces.",
            "Use only sketch/project/quiz cards.",
            "Use paragraph sketches.",
            'Use code_input with fixed_tests, template_io, or semantic recipes for Python tasks.',
            'Use recipeType "semantic" for function-return tasks, class/object tasks, methods, attributes, and data-transformation behavior.',
            'For semantic function tasks, use semanticChecks[] with type "function_returns".',
            'For class methods, use semanticChecks[] with type "method_returns" and include className.',        ],
        doNotGenerate: [
            "subject.manifest.json directly",
            "topic.bundle.json directly",
            "topics.generated.ts directly",
            "filesystem paths directly",
        ],
    },
};
