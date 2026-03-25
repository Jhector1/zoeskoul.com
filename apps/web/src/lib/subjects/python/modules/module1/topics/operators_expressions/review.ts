import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";


import {
    makeSketchCard,
    makeProjectCard,
    makeProjectSpec,
    makeProjectStep,
} from "@/lib/subjects/_core/reviewBuilders";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";

import { M1_OPERATORS_POOL } from "./generator";
import { PY_SUBJECT_SLUG} from "@/lib/subjects/python/subject";
import {PY_MOD1, PY_SECTION_MOD1} from "@/lib/subjects/python/modules/module1/meta";

const ID = TOPIC_ID;
const MINUTES = 10 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
} as const;


export const OPERATORS_EXPRESSIONS_REVIEW = {
    topic: {
        id: ID,
        label: K.label as any,
        minutes: MINUTES,
        summary: K.summary as any,
        cards: [
            makeSketchCard({
                topicId: ID,
                index: 0,
                title: K.cardTitle("sketch") as any,
                sketchId: "py.ops.expressions",
                height: 560,
            }),
            makeProjectCard({
                topicId: ID,
                index: 0,
                title:K.cardTitle("quiz") as any,
                spec: makeProjectSpec({
                    subject: PY_SUBJECT_SLUG,
                    module: PY_MOD1,
                    section: PY_SECTION_MOD1,
                    topic:TOPIC_SLUG,
                    difficulty: "easy",
                    allowReveal: true,
                    preferKind: null,
                    maxAttempts: 10,
                    steps: [
                        makeProjectStep({
                            id: "precedence",
                            title: K.projectStepTitle("precedence") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_ops_precedence_sc",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                        makeProjectStep({
                            id: "mod_even_odd",
                            title: K.projectStepTitle("mod_even_odd") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_ops_mod_evenodd_sc",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                        makeProjectStep({
                            id: "checkout",
                            title: K.projectStepTitle("checkout") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_ops_checkout_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                    ],
                }),
            }),
        ],
    } satisfies ReviewTopicShape,

    def: makeTopicDef({
        id: ID,
        label: K.label as any,
        minutes: MINUTES,
        pool: M1_OPERATORS_POOL,
    }) satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };