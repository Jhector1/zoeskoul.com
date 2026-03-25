// src/lib/subjects/python/modules/module1/topics/input_output_patterns/index.ts
import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
import { INPUT_OUTPUT_PATTERNS_REVIEW } from "./review";
import { INPUT_OUTPUT_PATTERNS_SKETCHES } from "./sketch";
import { M1_IO_GENERATOR_TOPIC } from "./generator";

// 

export const INPUT_OUTPUT_PATTERNS_TOPIC = defineTopicBundle({
    def: INPUT_OUTPUT_PATTERNS_REVIEW.def,
    review: INPUT_OUTPUT_PATTERNS_REVIEW.topic,
    sketches: INPUT_OUTPUT_PATTERNS_SKETCHES,
    generator: {
        pool: M1_IO_GENERATOR_TOPIC.pool,
        handlers: M1_IO_GENERATOR_TOPIC.handlers,
    },
});