import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { critiqueTopic } from "./critiqueTopic.js";
import {
    countPlanTopics,
    type CompileProgressCallback,
} from "./compileProgress.js";
import { resolvePlan } from "../spec/resolvePlan.js";
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";

export async function critiqueSubject(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
    onProgress?: CompileProgressCallback;
}) {
    validateBlueprint(args.blueprint);

    args.onProgress?.({
        current: 0,
        total: 0,
        stage: "resolving course structure",
    });

    const resolved = await resolvePlan({
        blueprint: args.blueprint,
        provider: args.provider,
    });

    const topicNodes = listTopicPlanNodes({
        plan: resolved.plan,
    });
    const totalTopics = topicNodes.length;

    if (resolved.source === "spec") {
        args.onProgress?.({
            current: 0,
            total: totalTopics,
            stage: "loaded course spec",
        });
    } else if (resolved.source === "saved_plan") {
        args.onProgress?.({
            current: 0,
            total: totalTopics,
            stage: "loaded saved plan",
        });
    } else {
        args.onProgress?.({
            current: 0,
            total: totalTopics,
            stage: "generated course plan",
        });
    }

    const results = [];
    let completedTopics = 0;

    for (const node of topicNodes) {
        args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: "critiquing topic",
            moduleSlug: node.module.moduleSlug,
            sectionSlug: node.section.sectionSlug,
            topicId: node.topic.topicId,
        });

        const result = await critiqueTopic({
            blueprint: args.blueprint,
            provider: args.provider,
            topicId: node.topic.topicId,
        });

        results.push(result);
        completedTopics += 1;

        args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: "completed topic critique",
            moduleSlug: node.module.moduleSlug,
            sectionSlug: node.section.sectionSlug,
            topicId: node.topic.topicId,
        });
    }

    args.onProgress?.({
        current: totalTopics,
        total: totalTopics,
        stage: "done",
    });

    return {
        mode: "fresh" as const,
        subjectSlug: args.blueprint.subjectSlug,
        topics: results,
    };
}