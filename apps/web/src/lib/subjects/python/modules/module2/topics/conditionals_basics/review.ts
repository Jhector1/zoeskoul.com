import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";

import {

    PY_SUBJECT_SLUG,

} from "@/lib/subjects/python/subject";
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";

import { M2_CONDITIONALS_POOL } from "./generator";
import {PY_MOD2, PY_SECTION_MOD2} from "@/lib/subjects/python/modules/module2/meta";

const MINUTES = 12 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
} as const;



export const CONDITIONALS_BASICS_REVIEW = {
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
                sketchId: "py.cond.basics",
                height: 640,
            },
            {
                type: "project",
                id: `${TOPIC_ID}_p0`,
                title: K.cardTitle("quiz") as any,
                passScore: 0.75,
                spec: {
                    subject: PY_SUBJECT_SLUG,
                    module: PY_MOD2,
                    section: PY_SECTION_MOD2,
                    topic:TOPIC_SLUG,
                    difficulty: "easy",
                    allowReveal: true,
                    preferKind: null,
                    maxAttempts: 10,
                    mode: "project",
                    steps: [
                        {
                            id: "age_gate",
                            title: K.projectStepTitle("age_gate") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_cond_age_gate_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "member_discount",
                            title: K.projectStepTitle("member_discount") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_cond_member_discount_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "password_check",
                            title: K.projectStepTitle("password_check") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_cond_password_check_code",
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
            pool: M2_CONDITIONALS_POOL.map((p) => ({ ...p })),
        },
    } satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };