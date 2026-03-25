import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { FUNCTIONS_BASICS_REVIEW } from "./review";
import { FUNCTIONS_BASICS_SKETCHES } from "./sketch";
import { M2_FUNCTIONS_GENERATOR_TOPIC} from "./generator";


export const FUNCTIONS_BASICS_TOPIC = defineTopicBundle({
    def: FUNCTIONS_BASICS_REVIEW.def,
    review: FUNCTIONS_BASICS_REVIEW.topic,
    sketches: FUNCTIONS_BASICS_SKETCHES,
    generator: {
        pool: M2_FUNCTIONS_GENERATOR_TOPIC.pool,
        handlers: M2_FUNCTIONS_GENERATOR_TOPIC.handlers,
    },
});