import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { DATA_TYPES_INTRO_REVIEW } from "./review";
import { DATA_TYPES_INTRO_SKETCHES } from "./sketch";
import { M1_TYPES_GENERATOR_TOPIC } from "./generator";
// 

export const DATA_TYPES_INTRO_TOPIC = defineTopicBundle({
    def: DATA_TYPES_INTRO_REVIEW.def,
    review: DATA_TYPES_INTRO_REVIEW.topic,
    sketches: DATA_TYPES_INTRO_SKETCHES,
    generator: {
        pool: M1_TYPES_GENERATOR_TOPIC.pool,
        handlers: M1_TYPES_GENERATOR_TOPIC.handlers,
    },
});