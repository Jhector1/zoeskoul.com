import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { CONDITIONALS_BASICS_REVIEW } from "./review";
import { CONDITIONALS_BASICS_SKETCHES } from "./sketch";
import {M2_CONDITIONALS_GENERATOR_TOPIC} from "./generator";


export const CONDITIONALS_BASICS_TOPIC = defineTopicBundle({
    def: CONDITIONALS_BASICS_REVIEW.def,
    review: CONDITIONALS_BASICS_REVIEW.topic,
    sketches: CONDITIONALS_BASICS_SKETCHES,
    generator: {
        pool: M2_CONDITIONALS_GENERATOR_TOPIC.pool,
        handlers: M2_CONDITIONALS_GENERATOR_TOPIC.handlers,
    },
});