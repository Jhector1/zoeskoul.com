import path from "node:path";
import type {
    CourseBlueprint,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { getProfileServices } from "@zoeskoul/curriculum-profiles";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { readTopicReports } from "../reports/readTopicReports.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { reviewPreparedTopicDraft } from "../quality/reviewPreparedTopicDraft.js";
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

    const repairedDraft = (saved.repairedDraft ??
        saved.rawDraft) as TopicAuthoringDraft | undefined;

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

    const review = await reviewPreparedTopicDraft({
        seed,
        draft: repairedDraft,
        profileServices,
    });

    await writeTopicReports({
        subjectSlug: args.blueprint.subjectSlug,
        moduleOrder: node.moduleIndex,
        topicId: node.topic.topicId,
        repairedDraft,
        repairReport: saved.repairReport,
        critiqueReport: review.critiqueReport,
        semanticReport: review.semanticReport,
        topicBundle: saved.topicBundle,
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
        repairReport: saved.repairReport,
        critiqueReport: review.critiqueReport,
        semanticReport: review.semanticReport,
    };
}