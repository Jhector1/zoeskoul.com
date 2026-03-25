// src/lib/subjects/python/modules/module1/topics/input_output_patterns/review.ts
import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";

import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";
import { M1_IO_POOL } from "./generator";
import {PY_SECTION_MOD1, PY_MOD1, PY_SUBJECT_SLUG} from "@/lib/subjects/python/modules/module1/meta";

const PK = {
    code_input: "code_input" as PracticeKind,
} as const;

export const INPUT_OUTPUT_PATTERNS_REVIEW = {
    topic: {
        id: TOPIC_ID,
        label: K.label as any,
        minutes: 14,
        summary: K.summary as any,
        cards: [
            {
                type: "sketch",
                id: `${TOPIC_ID}_s0`,
                title: K.cardTitle("sketch") as any,
                sketchId: "py.io.patterns",
                height: 640,
            },
            {
                type: "project",
                id: `${TOPIC_ID}_p0`,
                title:K.cardTitle("quiz") as any,
                passScore: 0.75,
                spec: {
                    subject: PY_SUBJECT_SLUG,
                    module: PY_MOD1,
                    section: PY_SECTION_MOD1,
                    topic: TOPIC_SLUG,
                    difficulty: "easy",
                    allowReveal: true,
                    preferKind: null,
                    maxAttempts: 10,
                    mode: "project",
                    steps: [
                        {
                            id: "age_next_year",
                            title: K.projectStepTitle("age_next_year") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_io_age_next_year",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "tip_calc",
                            title: K.projectStepTitle("tip_calc") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_io_tip_total",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "temp_convert",
                            title: K.projectStepTitle("temp_convert") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_io_c_to_f",
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
            minutes: 14,
            pool: M1_IO_POOL.map((p) => ({ ...p })),
        },
    } satisfies TopicDefInput,
} as const;