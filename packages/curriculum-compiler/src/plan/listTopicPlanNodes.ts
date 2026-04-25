import type { CoursePlan } from "@zoeskoul/curriculum-contracts";
import { moduleOrderToIndex } from "../spec/moduleOrder.js";
import type { TopicPlanNode } from "./findTopicPlanNode.js";

export function listTopicPlanNodes(args: {
    plan: CoursePlan;
}): TopicPlanNode[] {
    const out: TopicPlanNode[] = [];

    for (const module of args.plan.modules) {
        const moduleIndex = moduleOrderToIndex(module.order);

        for (const section of module.sections) {
            for (const topic of section.topics) {
                out.push({
                    module,
                    section,
                    topic,
                    moduleIndex,
                    sectionOrder: section.order,
                });
            }
        }
    }

    return out;
}