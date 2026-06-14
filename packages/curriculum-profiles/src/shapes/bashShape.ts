import type { SubjectShapePack } from "./types.js";
import { makeKeyPatterns } from "./sharedKeyPatterns.js";
import { sharedFilesystem } from "./sharedFilesystem.js";

export const bashShape: SubjectShapePack = {
    profileId: "bash",

    subjectManifest: {
        genKey: "bash_course",
        moduleSlug: (order) => `bash-${order}`,
        modulePrefix: (order) => `sh${order}`,
        sectionSlug: (moduleOrder, sectionOrder) =>
            `bash-${moduleOrder}-terminal-workspace-${sectionOrder}`,
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

    aiContract: {
        description:
            "Bash/Linux draft content compiles into terminal-first topic bundles and message files.",
        rules: [
            "Use existing Bash/Linux key namespaces.",
            "Use only sketch/project/quiz cards.",
            "Use paragraph sketches.",
            'Use code_input with recipeType "shell_task" for Linux terminal exercises.',
            'Use mode "terminal_workspace" for Course 1 Linux labs unless the authoring explicitly asks for another shell_task mode.',
            "Keep learner-facing wording about Linux or the Linux Terminal, not Bash as a course title.",
        ],
        doNotGenerate: [
            "subject.manifest.json directly",
            "topic.bundle.json directly",
            "topics.generated.ts directly",
            "filesystem paths directly",
        ],
    },
};
