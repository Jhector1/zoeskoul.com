import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { WORKSPACE_REVIEW } from "./review";
import { WORKSPACE_SKETCHES } from "./sketch";
import { M0_WORKSPACE_GENERATOR_TOPIC } from "./generator";

export const EDITOR_WORKSPACE_OVERVIEW_TOPIC = defineTopicBundle({
    def: WORKSPACE_REVIEW.def,
    review: WORKSPACE_REVIEW.topic,
    sketches: WORKSPACE_SKETCHES,
    generator: {
        pool: M0_WORKSPACE_GENERATOR_TOPIC.pool,
        handlers: M0_WORKSPACE_GENERATOR_TOPIC.handlers,
    },
});