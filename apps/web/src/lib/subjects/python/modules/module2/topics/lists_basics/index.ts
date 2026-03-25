import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { LISTS_BASICS_REVIEW } from "./review";
import { LISTS_BASICS_SKETCHES } from "./sketch";
import { M2_LISTS_GENERATOR_TOPIC} from "./generator";


export const LISTS_BASICS_TOPIC = defineTopicBundle({
    def: LISTS_BASICS_REVIEW.def,
    review: LISTS_BASICS_REVIEW.topic,
    sketches: LISTS_BASICS_SKETCHES,
    generator: {
        pool: M2_LISTS_GENERATOR_TOPIC.pool,
        handlers: M2_LISTS_GENERATOR_TOPIC.handlers,
    },
});