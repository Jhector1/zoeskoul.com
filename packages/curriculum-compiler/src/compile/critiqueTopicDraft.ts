import path from "node:path";
import type {
    CourseBlueprint,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateCoursePlan } from "@zoeskoul/curriculum-ai";
import {
    getProfileAdapter,
    getProfileServices,
} from "@zoeskoul/curriculum-profiles";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { validatePlan } from "../validate/validatePlan.js";
import { loadSavedPlan } from "../planning/loadSavedPlan.js";
import { savePlan } from "../planning/savePlan.js";
import { readTopicReports } from "../reports/readTopicReports.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { reviewPreparedTopicDraft } from "../quality/reviewPreparedTopicDraft.js";
import type { CompileProgressCallback } from "./compileProgress.js";

export async function critiqueTopicDraft(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
    topicId: string;
    onProgress?: CompileProgressCallback;
}) {
    validateBlueprint(args.blueprint);

    const totalStages = 4;
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
                    stage: "loading saved draft report",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                const saved = await readTopicReports({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder,
                    topicId: topic.topicId,
                });

                const repairedDraft = (saved.repairedDraft ??
                    saved.rawDraft) as TopicAuthoringDraft | undefined;

                if (!repairedDraft) {
                    throw new Error(
                        `No saved draft found for ${topic.topicId}. Compile the topic first before using critique-topic-draft.`,
                    );
                }

                advanceProgress({
                    stage: "reviewing saved draft",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                const review = await reviewPreparedTopicDraft({
                    seed,
                    draft: repairedDraft,
                    profileServices,
                });

                await writeTopicReports({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder,
                    topicId: topic.topicId,
                    repairedDraft,
                    repairReport: saved.repairReport,
                    critiqueReport: review.critiqueReport,
                    semanticReport: review.semanticReport,
                    topicBundle: saved.topicBundle,
                });

                advanceProgress({
                    stage: "completed saved draft critique",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                return {
                    mode: "draft" as const,
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
                    repairReport: saved.repairReport,
                    critiqueReport: review.critiqueReport,
                    semanticReport: review.semanticReport,
                };
            }
        }
    }

    throw new Error(`Topic not found in saved/generated plan: ${args.topicId}`);
}