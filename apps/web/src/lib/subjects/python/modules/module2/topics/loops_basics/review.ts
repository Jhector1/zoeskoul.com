import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";

import {
   
    PY_SUBJECT_SLUG,

} from "@/lib/subjects/python/subject";

import { M2_LOOPS_POOL } from "./generator";

const MINUTES = 14 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
} as const;
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";
import {PY_MOD2, PY_SECTION_MOD2} from "@/lib/subjects/python/modules/module2/meta";



export const LOOPS_BASICS_REVIEW = {
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
                sketchId: "py.loops.basics",
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
                            id: "guess_until_7",
                            title: K.projectStepTitle("guess_until_7") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_loop_guess_until_secret_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "validate_1_10",
                            title: K.projectStepTitle("validate_1_10") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_loop_keep_asking_valid_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        },
                        {
                            id: "echo_until_quit",
                            title: K.projectStepTitle("echo_until_quit") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m2_loop_echo_until_quit_code",
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
            pool: M2_LOOPS_POOL.map((p) => ({ ...p })),
        },
    } satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };