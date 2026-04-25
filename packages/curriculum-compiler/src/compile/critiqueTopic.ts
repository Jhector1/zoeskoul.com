import path from "node:path";
import type {
    CourseBlueprint,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateTopicAuthoringDraft } from "@zoeskoul/curriculum-ai";
import {
    getProfileServices,
    getSubjectShape,
} from "@zoeskoul/curriculum-profiles";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import type { CompileProgressCallback } from "./compileProgress.js";
import { resolvePlan } from "../spec/resolvePlan.js";
import { findTopicPlanNode } from "../plan/findTopicPlanNode.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";

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

    const shape = getSubjectShape(args.blueprint.profileId as "sql" | "python");
    const profileServices = getProfileServices(args.blueprint.profileId);

    const seed = buildTopicSeedFromPlanNode({
        blueprint: args.blueprint,
        spec: resolved.spec,
        module: node.module,
        section: node.section,
        topic: node.topic,
    });

    advanceProgress({
        stage: "generating topic draft",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
    });

    const rawDraft = await generateTopicAuthoringDraft(args.provider, {
        seed,
        locale: args.blueprint.sourceLocale,
        shape,
    });

    advanceProgress({
        stage: "evaluating topic draft",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
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
        moduleOrder: node.moduleIndex,
        topicId: node.topic.topicId,
        rawDraft,
        repairedDraft,
        repairReport: evaluation.repairReport,
        critiqueReport: evaluation.critiqueReport,
        semanticReport: evaluation.semanticReport,
    });

    advanceProgress({
        stage: "completed topic critique",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
    });

    return {
        mode: "fresh" as const,
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
        repairReport: evaluation.repairReport,
        critiqueReport: evaluation.critiqueReport,
        semanticReport: evaluation.semanticReport,
    };
}