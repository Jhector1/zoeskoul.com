import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";

import {

    PY_SUBJECT_SLUG,
 
} from "@/lib/subjects/python/subject";
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";

import { M2_FUNCTIONS_POOL } from "./generator";
import {PY_SECTION_MOD2,PY_MOD2} from "@/lib/subjects/python/modules/module2/meta";

const MINUTES = 14 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
    single_choice: "single_choice" as PracticeKind,
} as const;



export const FUNCTIONS_BASICS_REVIEW = {
    topic: {
        id: TOPIC_ID,
        label: K.label as any,
        minutes: MINUTES,
        summary: K.summary as any,
        cards: [
            {
                type: "sketch",
                id: `${TOPIC_ID}_s0`,
                title: K.cardTitle("sketch") as any,
                sketchId: "py.func.basics",
                height: 680,
            },
            {
                type: "project",
                id: `${TOPIC_ID}_p0`,
                title:K.cardTitle("quiz") as any,
                passScore: 0.75,
                spec: {
                    subject: PY_SUBJECT_SLUG,
                    module: PY_MOD2,
                    section: PY_SECTION_MOD2,
                    topic: TOPIC_SLUG,
                    difficulty: "easy",
                    allowReveal: true,
                    preferKind: null,
                    maxAttempts: 10,
                    mode: "project",
                    steps: [
                        {
                            id: "total_with_tip",
                            title: K.projectStepTitle("total_with_tip") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_func_total_with_tip_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "shipping_cost",
                            title: K.projectStepTitle("shipping_cost") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_func_shipping_rule_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "sum_list",
                            title: K.projectStepTitle("sum_list") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_func_sum_list_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                    ],
                },
            },
        ],
    } satisfies ReviewTopicShape,

    def: {
        id: TOPIC_ID,
        meta: {
            label: K.label as any,
            minutes: MINUTES,
            pool: M2_FUNCTIONS_POOL.map((p) => ({ ...p })),
        },
    } satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };