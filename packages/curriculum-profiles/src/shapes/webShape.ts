import type { SubjectShapePack } from "./types.js";
import { makeKeyPatterns } from "./sharedKeyPatterns.js";
import { sharedFilesystem } from "./sharedFilesystem.js";

export const webShape: SubjectShapePack = {
    profileId: "web",
    subjectManifest: {
        genKey: "html_foundations",
        moduleSlug: (order) => `html-${order}`,
        modulePrefix: (order) => `html${order}`,
        sectionSlug: (moduleOrder, sectionOrder) =>
            `html-${moduleOrder}-web-foundations-${sectionOrder}`,
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
        description: "Web draft content compiles into browser-rendered HTML topic bundles with source-checked practice.",
        rules: [
            "Use paragraph sketches for HTML Foundations.",
            "Use code_input with recipeType source_checks for hands-on HTML tasks.",
            "Use fixedLanguage web and index.html as the entry file.",
            "Validate HTML structure with explicit sourceChecks instead of Judge0 stdout tests.",
            "Keep CSS and JavaScript out of HTML Foundations except when showing that they exist as later layers.",
        ],
        doNotGenerate: [
            "subject.manifest.json directly",
            "topic.bundle.json directly",
            "topics.generated.ts directly",
            "Judge0 tests for HTML-only exercises",
        ],
    },
};
