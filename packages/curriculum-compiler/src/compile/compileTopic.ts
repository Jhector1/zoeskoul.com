import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import {
    generateCoursePlan,
    generateTopicAuthoringDraft,
    translateMessages,
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
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";
import { buildSubjectManifestFromPlan } from "../emit/buildSubjectManifestFromPlan.js";
import { buildSubjectMessagesFromPlan } from "../emit/buildSubjectMessagesFromPlan.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildMessagesFromDraft } from "../emit/buildMessagesFromDraft.js";
import { writeSubjectArtifacts } from "../write/writeSubjectArtifacts.js";
import { writeTopicArtifacts } from "../write/writeTopicArtifacts.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import type { CompileProgressCallback } from "./compileProgress.js";

export async function compileTopic(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
    topicId: string;
    onProgress?: CompileProgressCallback;
}) {
    validateBlueprint(args.blueprint);

    const extraLocales = (args.blueprint.targetLocales ?? []).filter(
        (locale) => locale !== args.blueprint.sourceLocale,
    );
    const totalStages = 8 + extraLocales.length * 2;
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

    advanceProgress({
        stage: "building subject manifest",
        topicId: args.topicId,
    });

    const subjectManifest = buildSubjectManifestFromPlan({
        blueprint: args.blueprint,
        plan,
        shape,
    });

    const sourceSubjectMessages = buildSubjectMessagesFromPlan({
        blueprint: args.blueprint,
        plan,
        shape,
    });

    const subjectMessagesByLocale: Record<string, Record<string, unknown>> = {
        [args.blueprint.sourceLocale]: sourceSubjectMessages,
    };

    for (const locale of extraLocales) {
        advanceProgress({
            stage: `translating subject messages (${locale})`,
            topicId: args.topicId,
        });

        subjectMessagesByLocale[locale] = await translateMessages(args.provider, {
            shape,
            sourceLocale: args.blueprint.sourceLocale,
            locale,
            sourceMessages: sourceSubjectMessages,
        });
    }

    advanceProgress({
        stage: "writing subject artifacts",
        topicId: args.topicId,
    });

    await writeSubjectArtifacts({
        subjectSlug: args.blueprint.subjectSlug,
        subjectManifest,
        subjectMessagesByLocale,
    });

    for (const module of plan.modules) {
        const moduleOrder = module.order - 1;

        for (const section of module.sections) {
            const sectionOrder = section.order;

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

                const draft = evaluation.draft;

                advanceProgress({
                    stage: "validating draft",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                assertTopicAuthoringDraft(draft);

                if (!evaluation.critiqueReport.ok) {
                    const critiqueErrors = evaluation.critiqueReport.issues.filter(
                        (issue) => issue.severity === "error",
                    );
                    if (critiqueErrors.length) {
                        throw new Error(
                            `Critique failed:\n${critiqueErrors.map((x) => `- ${x.message}`).join("\n")}`,
                        );
                    }
                }

                if (!evaluation.semanticReport.ok) {
                    const semanticErrors = evaluation.semanticReport.issues.filter(
                        (issue) => issue.severity === "error",
                    );
                    if (semanticErrors.length) {
                        throw new Error(
                            `Semantic validation failed:\n${semanticErrors
                                .map((x) => `- ${x.message}`)
                                .join("\n")}`,
                        );
                    }
                }

                advanceProgress({
                    stage: "building topic bundle",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                const topicBundle = buildTopicBundleFromDraft({
                    shape,
                    seed,
                    draft,
                    moduleOrder,
                    sectionOrder,
                });

                const sourceMessages = buildMessagesFromDraft({
                    shape,
                    seed,
                    draft,
                    moduleOrder,
                });

                const messagesByLocale: Record<string, Record<string, unknown>> = {
                    [args.blueprint.sourceLocale]: sourceMessages,
                };

                for (const locale of extraLocales) {
                    advanceProgress({
                        stage: `translating topic messages (${locale})`,
                        topicId: topic.topicId,
                        moduleSlug: module.moduleSlug,
                        sectionSlug: section.sectionSlug,
                    });

                    messagesByLocale[locale] = await translateMessages(args.provider, {
                        shape,
                        sourceLocale: args.blueprint.sourceLocale,
                        locale,
                        sourceMessages,
                    });
                }

                advanceProgress({
                    stage: "writing topic artifacts",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                await writeTopicArtifacts({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder,
                    topicId: topic.topicId,
                    topicBundle,
                    messagesByLocale,
                });

                await writeTopicReports({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder,
                    topicId: topic.topicId,
                    rawDraft,
                    repairedDraft: draft,
                    repairReport: evaluation.repairReport,
                    critiqueReport: evaluation.critiqueReport,
                    semanticReport: evaluation.semanticReport,
                    topicBundle,
                });

                advanceProgress({
                    stage: "completed topic",
                    topicId: topic.topicId,
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                });

                return {
                    topicId: topic.topicId,
                    subjectSlug: args.blueprint.subjectSlug,
                };
            }
        }
    }

    throw new Error(`Topic not found in saved/generated plan: ${args.topicId}`);
}