import type { SubjectShapePack } from "../shapes/types.js";
import { sharedFilesystem } from "../shapes/sharedFilesystem.js";
import { makeKeyPatterns } from "../shapes/sharedKeyPatterns.js";

export type TerminalShapeConfig = {
    profileId: string;
    genKey: string;
    moduleSlug(order: number): string;
    modulePrefix(order: number): string;
    sectionSlug(moduleOrder: number, sectionOrder: number): string;
    aiDescription: string;
    aiRules: string[];
};

export function createTerminalShape(
    config: TerminalShapeConfig,
): SubjectShapePack {
    return {
        profileId: config.profileId,

        subjectManifest: {
            genKey: config.genKey,
            moduleSlug: config.moduleSlug,
            modulePrefix: config.modulePrefix,
            sectionSlug: config.sectionSlug,
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
            projectFields: [
                "difficulty",
                "allowReveal",
                "preferKind",
                "maxAttempts",
                "steps",
            ],
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
                requiredFields: [
                    "id",
                    "kind",
                    "purpose",
                    "weight",
                    "messageBase",
                    "optionIds",
                    "expected",
                ],
            },
            multiChoice: {
                requiredFields: [
                    "id",
                    "kind",
                    "purpose",
                    "weight",
                    "messageBase",
                    "optionIds",
                    "expected",
                ],
            },
            dragReorder: {
                requiredFields: [
                    "id",
                    "kind",
                    "purpose",
                    "weight",
                    "messageBase",
                    "tokenIds",
                    "expected",
                ],
            },
            fillBlankChoice: {
                requiredFields: [
                    "id",
                    "kind",
                    "purpose",
                    "weight",
                    "messageBase",
                    "choiceCount",
                    "expected",
                ],
            },
        },

        aiContract: {
            description: config.aiDescription,
            rules: config.aiRules,
            doNotGenerate: [
                "subject.manifest.json directly",
                "topic.bundle.json directly",
                "topics.generated.ts directly",
                "filesystem paths directly",
            ],
        },
    };
}
