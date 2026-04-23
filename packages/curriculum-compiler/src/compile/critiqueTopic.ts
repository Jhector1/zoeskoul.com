import path from "node:path";
import type {
    CourseBlueprint,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import {
    generateCoursePlan,
    generateTopicAuthoringDraft,
} from "@zoeskoul/curriculum-ai";
import {
    getProfileAdapter,
    getProfileServices,
    getSubjectShape,
} from "@zoeskoul/curriculum-profiles";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { validatePlan } from "../validate/validatePlan.js";
import { loadSavedPlan } from "../planning/loadSavedPlan.js";
import { savePlan } from "../planning/savePlan.js";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import type { CompileProgressCallback } from "./compileProgress.js";

export async function critiqueTopic(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
    topicId: string;
    onProgress?: CompileProgressCallback;
}) {
    validateBlueprint(args.blueprint);

    const totalStages = 5;
    let currentStage = 0;

    function advanceProgress(info: {
        stage: string;
        moduleSlug?: string;
        sectionSlug?: string;
        topicId?: string;
    }) {
        currentStage += 1;
        args.onProgress?.({
            current: Math.min(currentStage, totalStages),
            total: totalStages,
            stage: info.stage,
            moduleSlug: info.moduleSlug,
            sectionSlug: info.sectionSlug,
            topicId: info.topicId ?? args.topicId,
        });
    }

    args.onProgress?.({
        current: 0,
        total: totalStages,
        stage: "starting",
        topicId: args.topicId,
    });

    let plan = await loadSavedPlan(args.blueprint.subjectSlug);

    if (!plan) {
        advanceProgress({
            stage: "generating course plan",
            topicId: args.topicId,
        });

        plan = await generateCoursePlan(args.provider, args.blueprint);
        validatePlan(plan);
        await savePlan(args.blueprint.subjectSlug, plan);
    } else {
        validatePlan(plan);

        advanceProgress({
            stage: "loaded saved plan",
            topicId: args.topicId,
        });
    }

    const shape = getSubjectShape(args.blueprint.profileId as "sql" | "python");
    const adapter = getProfileAdapter(args.blueprint.profileId);
    const profileServices = getProfileServices(args.blueprint.profileId);

    for (const module of plan.modules) {
        const moduleOrder = module.order - 1;

        for (const section of module.sections) {
            for (const topic of section.topics) {
                if (topic.topicId !== args.topicId) continue;

                const seed = adapter.buildTopicSeed({
                    blueprint: args.blueprint,
                    module: {
                        slug: module.moduleSlug,
                        title: module.title,
                        order: module.order,
                        purpose: undefined,
                        learningObjectives: topic.learningGoals,
                        guidedExercises: [],
                        quizFocus: [],
                        moduleProject: undefined,
                    },
                    section: {
                        slug: section.sectionSlug,
                        title: section.title,
                        order: section.order,
                    },
                    topic: {
                        topicId: topic.topicId,
                        order: topic.order,
                        title: topic.title,
                        summary: topic.summary,
                        minutes: topic.minutes,
                    },
                });

                advanceProgress({
                    stage: "generating topic draft",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                const rawDraft = await generateTopicAuthoringDraft(args.provider, {
                    seed,
                    locale: args.blueprint.sourceLocale,
                    shape,
                });

                advanceProgress({
                    stage: "evaluating topic draft",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                const evaluation = await evaluateTopicDraft({
                    provider: args.provider,
                    seed,
                    rawDraft,
                    profileServices,
                });

                const repairedDraft = evaluation.draft as TopicAuthoringDraft;

                await writeTopicReports({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder,
                    topicId: topic.topicId,
                    rawDraft,
                    repairedDraft,
                    repairReport: evaluation.repairReport,
                    critiqueReport: evaluation.critiqueReport,
                    semanticReport: evaluation.semanticReport,
                });

                advanceProgress({
                    stage: "completed topic critique",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                return {
                    mode: "fresh" as const,
                    subjectSlug: args.blueprint.subjectSlug,
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                    moduleOrder,
                    reportDir: path.join(
                        ".curriculum-drafts",
                        "reports",
                        args.blueprint.subjectSlug,
                        `module${moduleOrder}`,
                        topic.topicId,
                    ),
                    repairReport: evaluation.repairReport,
                    critiqueReport: evaluation.critiqueReport,
                    semanticReport: evaluation.semanticReport,
                };
            }
        }
    }

    throw new Error(`Topic not found in saved/generated plan: ${args.topicId}`);
}