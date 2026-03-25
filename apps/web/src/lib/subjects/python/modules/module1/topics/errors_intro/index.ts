import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { ERRORS_INTRO_REVIEW } from "./review";
import { ERRORS_INTRO_SKETCHES } from "./sketch";
import { M1_ERRORS_GENERATOR_TOPIC} from "./generator";
// 

export const ERRORS_INTRO_TOPIC = defineTopicBundle({
    def: ERRORS_INTRO_REVIEW.def,
    review: ERRORS_INTRO_REVIEW.topic,
    sketches: ERRORS_INTRO_SKETCHES,
    generator: {
        pool: M1_ERRORS_GENERATOR_TOPIC.pool,
        handlers: M1_ERRORS_GENERATOR_TOPIC.handlers,
    },
});