import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";

import {
    PY_MOD0,
    PY_SECTION_MOD0,
} from "../../meta";
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";

import {
    makeSketchCard,
    makeQuizCard,
    makeQuizSpec,
} from "@/lib/subjects/_core/reviewBuilders";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";

import { M0_COMMENTS_POOL } from "./generator";
import {PY_SUBJECT_SLUG} from "@/lib/subjects/python/subject";

const MINUTES = 4 as const;



export const COMMENTS_INTRO_REVIEW = {
    topic: {
        id: TOPIC_ID,
        label: K.label as any,
        minutes: MINUTES,
        summary: K.summary as any,
        cards: [
            makeSketchCard({
                topicId: TOPIC_ID,
                index: 0,
                title: K.cardTitle("sketch") as any,
                sketchId: "py.syntax.comments",
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
                    n: 3,
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
        pool: M0_COMMENTS_POOL,
    }) satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };