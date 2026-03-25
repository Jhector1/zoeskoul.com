// src/lib/subjects/python/modules/module0/topics/computer_intro/index.ts
import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { COMPUTER_INTRO_REVIEW } from "./review";
import { COMPUTER_INTRO_SKETCHES } from "./sketch";
import {M0_COMPUTER_GENERATOR_TOPIC } from "./generator";
// 

export const COMPUTER_INTRO_TOPIC = defineTopicBundle({
    def: COMPUTER_INTRO_REVIEW.def,
    review: COMPUTER_INTRO_REVIEW.topic,
    sketches: COMPUTER_INTRO_SKETCHES,
    generator: {
        pool: M0_COMPUTER_GENERATOR_TOPIC.pool,
        handlers: M0_COMPUTER_GENERATOR_TOPIC.handlers,
    },
});