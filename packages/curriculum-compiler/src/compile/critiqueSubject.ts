import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateCoursePlan } from "@zoeskoul/curriculum-ai";
import { loadSavedPlan } from "../planning/loadSavedPlan.js";
import { savePlan } from "../planning/savePlan.js";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { validatePlan } from "../validate/validatePlan.js";
import { critiqueTopic } from "./critiqueTopic.js";
import {
    countPlanTopics,
    type CompileProgressCallback,
} from "./compileProgress.js";

export async function critiqueSubject(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
    onProgress?: CompileProgressCallback;
}) {
    validateBlueprint(args.blueprint);

    args.onProgress?.({
        current: 0,
        total: 0,
        stage: "loading saved plan",
    });

    let plan = await loadSavedPlan(args.blueprint.subjectSlug);

    if (!plan) {
        args.onProgress?.({
            current: 0,
            total: 0,
            stage: "generating course plan",
        });

        plan = await generateCoursePlan(args.provider, args.blueprint);
        validatePlan(plan);
        await savePlan(args.blueprint.subjectSlug, plan);

        args.onProgress?.({
            current: 0,
            total: countPlanTopics(plan),
            stage: "saved course plan",
        });
    } else {
        validatePlan(plan);

        args.onProgress?.({
            current: 0,
            total: countPlanTopics(plan),
            stage: "loaded saved plan",
        });
    }

    const results = [];
    const totalTopics = countPlanTopics(plan);
    let completedTopics = 0;

    for (const module of plan.modules) {
        for (const section of module.sections) {
            for (const topic of section.topics) {
                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: "critiquing topic",
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                    topicId: topic.topicId,
                });

                const result = await critiqueTopic({
                    blueprint: args.blueprint,
                    provider: args.provider,
                    topicId: topic.topicId,
                });

                results.push(result);
                completedTopics += 1;

                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: "completed topic critique",
                    moduleSlug: module.moduleSlug,
                    sectionSlug: section.sectionSlug,
                    topicId: topic.topicId,
                });
            }
        }
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