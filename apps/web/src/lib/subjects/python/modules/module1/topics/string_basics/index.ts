import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { STRING_BASICS_REVIEW } from "./review";
import { STRING_BASICS_SKETCHES } from "./sketch";
import { M1_STRINGS_GENERATOR_TOPIC } from "./generator";


export const STRING_BASICS_TOPIC = defineTopicBundle({
    def: STRING_BASICS_REVIEW.def,
    review: STRING_BASICS_REVIEW.topic,
    sketches: STRING_BASICS_SKETCHES,
    generator: {
        pool: M1_STRINGS_GENERATOR_TOPIC.pool,
        handlers: M1_STRINGS_GENERATOR_TOPIC.handlers,
    },
});