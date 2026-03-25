import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { OPERATORS_EXPRESSIONS_REVIEW } from "./review";
import { OPERATORS_EXPRESSIONS_SKETCHES } from "./sketch";
import { M1_GENERATOR_OPERATORS_TOPIC } from "./generator";


export const OPERATORS_EXPRESSIONS_TOPIC = defineTopicBundle({
    def: OPERATORS_EXPRESSIONS_REVIEW.def,
    review: OPERATORS_EXPRESSIONS_REVIEW.topic,
    sketches: OPERATORS_EXPRESSIONS_SKETCHES,
    generator: {
        pool: M1_GENERATOR_OPERATORS_TOPIC.pool,
        handlers: M1_GENERATOR_OPERATORS_TOPIC.handlers,
    },
});