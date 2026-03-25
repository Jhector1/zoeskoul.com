import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { VARIABLES_INTRO_REVIEW } from "./review";
import { VARIABLES_INTRO_SKETCHES } from "./sketch";
import { VARS_GENERATOR_TOPIC} from "./generator";


export const VARIABLES_INTRO_TOPIC = defineTopicBundle({
    def: VARIABLES_INTRO_REVIEW.def,
    review: VARIABLES_INTRO_REVIEW.topic,
    sketches: VARIABLES_INTRO_SKETCHES,
    generator: {
        pool: VARS_GENERATOR_TOPIC.pool,
        handlers: VARS_GENERATOR_TOPIC.handlers,
    },
});