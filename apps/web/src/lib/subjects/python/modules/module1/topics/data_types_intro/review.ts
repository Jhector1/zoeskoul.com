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
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";

import { M1_TYPES_POOL } from "./generator";
import {PY_MOD1, PY_SECTION_MOD1} from "@/lib/subjects/python/modules/module1/meta";
// import {PY_TOPIC_SLUG_MOD1} from "@/lib/speech/thumbs_subjects/python/subject";

const MINUTES = 12 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
} as const;

// const K = {
//     label: `@:topics.python.python-1.${TOPIC_ID}.label`,
//     summary: `@:topics.python.python-1.${TOPIC_ID}.summary`,
//     sketch0Title: `@:topics.python.python-1.${TOPIC_ID}.cards.sketch0.title`,
//     sketch1Title: `@:topics.python.python-1.${TOPIC_ID}.cards.sketch1.title`,
//     projectTitle: `@:topics.python.python-1.${TOPIC_ID}.cards.project.title`,
// } as const;

export const DATA_TYPES_INTRO_REVIEW = {
    topic: {
        id: TOPIC_ID,
        label: K.label as any,
        minutes: MINUTES,
        summary: K.summary as any,
        cards: [
            makeSketchCard({
                topicId: TOPIC_ID,
                index: 0,
                title:K.cardTitle("sketch0") as any,
                sketchId: "py.types.basic",
                height: 560,
            }),
            makeSketchCard({
                topicId: TOPIC_ID,
                index: 1,
                title: K.cardTitle("sketch1"),
                sketchId: "py.types.convert",
                height: 560,
            }),
            makeProjectCard({
                topicId: TOPIC_ID,
                index: 0,
                title:K.cardTitle("quiz") as any,
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
                            id: "convert_next_year",
                            title:  K.projectStepTitle("m1_types_convert_next_year_code") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_types_convert_next_year_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                        makeProjectStep({
                            id: "tip_total",
                            title:  K.projectStepTitle("m1_types_tip_total_code") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_types_tip_total_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                        makeProjectStep({
                            id: "c_to_f",
                            title:  K.projectStepTitle("m1_types_c_to_f_code") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_types_c_to_f_code",
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
        pool: M1_TYPES_POOL,
    }) satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };