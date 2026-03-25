// src/lib/subjects/python/modules/module0/topics/programming_intro/index.ts
import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { PROGRAMMING_INTRO_REVIEW } from "./review";
import { PROGRAMMING_INTRO_SKETCHES } from "./sketch";
import { M0_PROGRAMMING_GENERATOR_TOPIC } from "./generator";
// 

export const PROGRAMMING_INTRO_TOPIC = defineTopicBundle({
    def: PROGRAMMING_INTRO_REVIEW.def,
    review: PROGRAMMING_INTRO_REVIEW.topic,
    sketches: PROGRAMMING_INTRO_SKETCHES,
    generator: {
        pool: M0_PROGRAMMING_GENERATOR_TOPIC.pool,
        handlers: M0_PROGRAMMING_GENERATOR_TOPIC.handlers,
    },
});