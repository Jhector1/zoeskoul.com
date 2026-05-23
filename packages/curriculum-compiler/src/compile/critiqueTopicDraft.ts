import path from "node:path";
import type {
    CourseBlueprint,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import {
    getProfileServices,
    getSubjectShape,
} from "@zoeskoul/curriculum-profiles";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { readTopicReports } from "../reports/readTopicReports.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { reviewPreparedTopicDraft } from "../quality/reviewPreparedTopicDraft.js";
import { normalizeTopicAuthoringDraft } from "../normalize/normalizeTopicAuthoringDraft.js";
import { repairTopicAuthoringDraft } from "../normalize/repairTopicAuthoringDraft.js";
import { sanitizeHintLeaksInDraft } from "../normalize/sanitizeHintLeaksInDraft.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import type { CompileProgressCallback } from "./compileProgress.js";
import { resolvePlan } from "../spec/resolvePlan.js";
import { findTopicPlanNode } from "../plan/findTopicPlanNode.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";

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

    const resolved = await resolvePlan({
        blueprint: args.blueprint,
        provider: args.provider,
    });

    if (resolved.source === "spec") {
        advanceProgress({
            stage: "loaded course spec",
            topicId: args.topicId,
        });
    } else if (resolved.source === "saved_plan") {
        advanceProgress({
            stage: "loaded saved plan",
            topicId: args.topicId,
        });
    } else {
        advanceProgress({
            stage: "generated course plan",
            topicId: args.topicId,
        });
    }

    const node = findTopicPlanNode({
        plan: resolved.plan,
        topicId: args.topicId,
    });

    if (!node) {
        throw new Error(`Topic not found in resolved course structure: ${args.topicId}`);
    }

    const shape = getSubjectShape(args.blueprint.profileId);
    const profileServices = getProfileServices(args.blueprint.profileId);

    const seed = buildTopicSeedFromPlanNode({
        blueprint: args.blueprint,
        spec: resolved.spec,
        module: node.module,
        section: node.section,
        topic: node.topic,
    });

    advanceProgress({
        stage: "loading saved draft report",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
    });

    const saved = await readTopicReports({
        subjectSlug: args.blueprint.subjectSlug,
        moduleOrder: node.moduleIndex,
        topicId: node.topic.topicId,
    });

    const repairedDraft = (saved.rawDraft ??
        saved.repairedDraft) as TopicAuthoringDraft | undefined;

    if (!repairedDraft) {
        throw new Error(
            `No saved draft found for ${node.topic.topicId}. Compile the topic first before using critique-topic-draft.`,
        );
    }

    advanceProgress({
        stage: "reviewing saved draft",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
    });

    let preparedDraft = normalizeTopicAuthoringDraft(repairedDraft, {
        profileId: seed.profileId,
    });
    preparedDraft = repairTopicAuthoringDraft(preparedDraft, seed);
    preparedDraft = sanitizeHintLeaksInDraft(preparedDraft, seed);

    const refreshedRepair = await profileServices.repairDraft({
        seed,
        draft: preparedDraft,
    });

    preparedDraft = repairTopicAuthoringDraft(refreshedRepair.draft, seed);
    preparedDraft = sanitizeHintLeaksInDraft(preparedDraft, seed);

    const mergedRepairReport = {
        topicId: seed.topicId,
        repairs: refreshedRepair.report.repairs ?? [],
    };

    const topicBundle = buildTopicBundleFromDraft({
        shape,
        seed,
        draft: preparedDraft,

    });

    const review = await reviewPreparedTopicDraft({
        seed,
        draft: preparedDraft,
        topicBundle,
        profileServices,
    });

    await writeTopicReports({
        subjectSlug: args.blueprint.subjectSlug,
        moduleOrder: node.moduleIndex,
        topicId: node.topic.topicId,
        repairedDraft: preparedDraft,
        repairReport: mergedRepairReport,
        critiqueReport: review.critiqueReport,
        semanticReport: review.semanticReport,
        goldenReport: review.goldenReport,
        topicBundle,
    });

    advanceProgress({
        stage: "completed saved draft critique",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
    });

    return {
        mode: "draft" as const,
        subjectSlug: args.blueprint.subjectSlug,
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
        moduleOrder: node.moduleIndex,
        reportDir: path.join(
            ".curriculum-drafts",
            "reports",
            args.blueprint.subjectSlug,
            `module${node.moduleIndex}`,
            node.topic.topicId,
        ),
        repairReport: mergedRepairReport,
        critiqueReport: review.critiqueReport,
        semanticReport: review.semanticReport,
        goldenReport: review.goldenReport,
    };
}
