import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";

import {
    PY_SUBJECT_SLUG,

} from "@/lib/subjects/python/subject";

import {
    makeSketchCard,
    makeProjectCard,
    makeProjectSpec,
    makeProjectStep,
} from "@/lib/subjects/_core/reviewBuilders";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";

import { M1_STRINGS_POOL } from "./generator";

const MINUTES = 12 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
    single_choice: "single_choice" as PracticeKind,
} as const;

import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";
import {PY_MOD1, PY_SECTION_MOD1} from "@/lib/subjects/python/modules/module1/meta";

export const STRING_BASICS_REVIEW = {
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
                sketchId: "py.strings.basics",
                height: 600,
            }),
            makeProjectCard({
                topicId: TOPIC_ID,
                index: 0,
                title:K.cardTitle("sketch") as any,
                spec: makeProjectSpec({
                    subject: PY_SUBJECT_SLUG,
                    module: PY_MOD1,
                    section: PY_SECTION_MOD1,
                    topic: TOPIC_SLUG,
                    difficulty: "easy",
                    allowReveal: true,
                    preferKind: null,
                    maxAttempts: 10,
                    steps: [
                        makeProjectStep({
                            id: "concat_vs_comma",
                            title:K.projectStepTitle("concat_vs_comma") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.single_choice,
                            exerciseKey: "m1_str_concat_vs_comma_sc",
                            seedPolicy: "global",
                            maxAttempts: 3,
                        }),
                        makeProjectStep({
                            id: "fstring_greeting",
                            title:K.projectStepTitle("fstring_greeting") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_str_fstring_greeting_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                        makeProjectStep({
                            id: "username_generator",
                            title:K.projectStepTitle("username_generator") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_str_username_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                    ],
                }),
            }),
        ],
    } satisfies ReviewTopicShape,

    def: makeTopicDef({
        id: TOPIC_ID,
        label: K.label as any,
        minutes: MINUTES,
        pool: M1_STRINGS_POOL,
    }) satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };