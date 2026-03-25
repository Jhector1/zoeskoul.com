import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";

import {
  
    PY_SUBJECT_SLUG,
} from "@/lib/subjects/python/subject";
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";

import { M2_LISTS_POOL } from "./generator";
import {PY_MOD2, PY_SECTION_MOD2} from "@/lib/subjects/python/modules/module2/meta";

const MINUTES = 12 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
} as const;



export const LISTS_BASICS_REVIEW = {
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
                sketchId: "py.lists.basics",
                height: 640,
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
                    topic:TOPIC_SLUG,
                    difficulty: "easy",
                    allowReveal: true,
                    preferKind: null,
                    maxAttempts: 10,
                    mode: "project",
                    steps: [
                        {
                            id: "sum_avg_3",
                            title: K.projectStepTitle("sum_avg_3") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_list_three_prices_sum_avg_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "max_of_4",
                            title: K.projectStepTitle("max_of_4") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_list_max_of_four_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "names_2",
                            title: K.projectStepTitle("names_2") as any,
                            topic:TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_list_build_names_print_code",
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
            pool: M2_LISTS_POOL.map((p) => ({ ...p })),
        },
    } satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };