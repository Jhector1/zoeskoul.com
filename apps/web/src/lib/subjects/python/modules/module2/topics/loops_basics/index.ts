import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { LOOPS_BASICS_REVIEW } from "./review";
import { LOOPS_BASICS_SKETCHES } from "./sketch";
import { M2_LOOPS_GENERATOR_TOPIC } from "./generator";


export const LOOPS_BASICS_TOPIC = defineTopicBundle({
    def: LOOPS_BASICS_REVIEW.def,
    review: LOOPS_BASICS_REVIEW.topic,
    sketches: LOOPS_BASICS_SKETCHES,
    generator: {
        pool: M2_LOOPS_GENERATOR_TOPIC.pool,
        handlers: M2_LOOPS_GENERATOR_TOPIC.handlers,
    },
});