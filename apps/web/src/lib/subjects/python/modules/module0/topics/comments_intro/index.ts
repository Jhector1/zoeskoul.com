import { defineTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";
// import { PY_COMMENTS } from "@/lib/subjects/python/modules/module0/topics/comments.topics";
import { COMMENTS_INTRO_SKETCHES } from "./sketch";
import { M0_COMMENTS_GENERATOR_TOPIC} from "./generator";
import {COMMENTS_INTRO_REVIEW} from "@/lib/subjects/python/modules/module0/topics/comments_intro/review";
// 

export const COMMENTS_INTRO_TOPIC = defineTopicBundle({
    def: COMMENTS_INTRO_REVIEW.def,
    review: COMMENTS_INTRO_REVIEW.topic,
    sketches: COMMENTS_INTRO_SKETCHES,
    generator: {
        pool: M0_COMMENTS_GENERATOR_TOPIC.pool,
        handlers: M0_COMMENTS_GENERATOR_TOPIC.handlers,
    },
});