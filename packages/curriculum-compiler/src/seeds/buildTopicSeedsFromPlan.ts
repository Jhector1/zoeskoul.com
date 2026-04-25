import type {
    CourseBlueprint,
    CourseSpec,
    CoursePlan,
} from "@zoeskoul/curriculum-contracts";
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";
import { buildTopicSeedFromPlanNode } from "./buildTopicSeedFromPlanNode.js";

export function buildTopicSeedsFromPlan(args: {
    blueprint: CourseBlueprint;
    plan: CoursePlan;
    spec?: CourseSpec | null;
}) {
    return listTopicPlanNodes({ plan: args.plan }).map((node) =>
        buildTopicSeedFromPlanNode({
            blueprint: args.blueprint,
            spec: args.spec ?? null,
            module: node.module,
            section: node.section,
            topic: node.topic,
        }),
    );
}