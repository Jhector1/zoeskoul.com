import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { SYNTAX_INTRO_REVIEW } from "./review";
import { SYNTAX_INTRO_SKETCHES } from "./sketch";
import { M0_SYNTAX_GENERATOR_TOPIC } from "./generator";
// 

export const SYNTAX_INTRO_TOPIC = defineTopicBundle({
    def: SYNTAX_INTRO_REVIEW.def,
    review: SYNTAX_INTRO_REVIEW.topic,
    sketches: SYNTAX_INTRO_SKETCHES,
    generator: {
        pool: M0_SYNTAX_GENERATOR_TOPIC.pool,
        handlers: M0_SYNTAX_GENERATOR_TOPIC.handlers,
    },
});