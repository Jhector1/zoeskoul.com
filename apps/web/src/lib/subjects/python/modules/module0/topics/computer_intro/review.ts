// src/lib/subjects/python/modules/module0/topics/computer_intro/review.ts
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";

import {

    PY_MOD0,
    PY_SECTION_MOD0,
} from "../../meta";

import {
    makeSketchCard,
    makeQuizCard,
    makeQuizSpec,
} from "@/lib/subjects/_core/reviewBuilders";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";

import { M0_COMPUTER_POOL } from "./generator";
import {PY_SUBJECT_SLUG} from "@/lib/subjects/python/subject";

const MINUTES = 8 as const;

// const K = {
//     label: `@:topics.python.python-0.${TOPIC_ID}.label`,
//     summary: `@:topics.python.python-0.${TOPIC_ID}.summary`,
//     sketch0Title: `@:topics.python.python-0.${TOPIC_ID}.cards.sketch0.title`,
//     sketch1Title: `@:topics.python.python-0.${TOPIC_ID}.cards.sketch1.title`,
//     quizTitle: `@:topics.python.python-0.${TOPIC_ID}.cards.quiz.title`,
// } as const;

export const COMPUTER_INTRO_REVIEW = {
    topic: {
        id: TOPIC_ID,
        label: K.label as any,
        minutes: MINUTES,
        summary: K.summary as any,
        cards: [
            makeSketchCard({
                topicId: TOPIC_ID,
                index: 0,
                title: K.cardTitle("sketch0") as any,
                sketchId: "py.computer.ipo",
                height: 520,
            }),
            makeSketchCard({
                topicId: TOPIC_ID,
                index: 1,
                title: K.cardTitle("sketch1") as any,
                sketchId: "py.computer.instructions",
                height: 520,
            }),
            makeQuizCard({
                topicId: TOPIC_ID,
                index: 0,
                title: K.cardTitle("quiz") as any,
                spec: makeQuizSpec({
                    subject: PY_SUBJECT_SLUG,
                    module: PY_MOD0,
                    section: PY_SECTION_MOD0,
                    topic: TOPIC_SLUG,
                    difficulty: "easy",
                    n: M0_COMPUTER_POOL.length,
                    allowReveal: true,
                    preferKind: null,
                    maxAttempts: 10,
                }),
            }),
        ],
    } satisfies ReviewTopicShape,

    def: makeTopicDef({
        id: TOPIC_ID,
        label: K.label as any,
        minutes: MINUTES,
        pool: M0_COMPUTER_POOL,
    }) satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };