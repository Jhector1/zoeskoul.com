import type {
    CoursePlan,
    PlannedModule,
    PlannedSection,
    PlannedTopic,
} from "@zoeskoul/curriculum-contracts";
import { moduleOrderToIndex } from "../spec/moduleOrder.js";

export type TopicPlanNode = {
    module: PlannedModule;
    section: PlannedSection;
    topic: PlannedTopic;
    moduleIndex: number;
    sectionOrder: number;
};

export function findTopicPlanNode(args: {
    plan: CoursePlan;
    topicId: string;
}): TopicPlanNode | null {
    for (const module of args.plan.modules) {
        const moduleIndex = moduleOrderToIndex(module.order);

        for (const section of module.sections) {
            for (const topic of section.topics) {
                if (topic.topicId !== args.topicId) continue;

                return {
                    module,
                    section,
                    topic,
                    moduleIndex,
                    sectionOrder: section.order,
                };
            }
        }
    }

    return null;
}