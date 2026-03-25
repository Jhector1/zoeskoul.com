import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { PracticeKind } from "@prisma/client";

import {
    PY_SUBJECT_SLUG,
  
} from "@/lib/subjects/python/subject";
import { TOPIC_ID, TOPIC_SLUG, K } from "./meta";

import {
    makeSketchCard,
    makeProjectCard,
    makeProjectSpec,
    makeProjectStep,
} from "@/lib/subjects/_core/reviewBuilders";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";

import { M1_VARS_POOL } from "./generator";
import {PY_SECTION_MOD1, PY_MOD1} from "@/lib/subjects/python/modules/module1/meta";

const MINUTES = 10 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
} as const;



export const VARIABLES_INTRO_REVIEW = {
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
                sketchId: "py.vars.boxes",
                height: 560,
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
                            id: "boxes_print",
                            title: K.projectStepTitle("boxes_print") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_vars_boxes_print_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                        makeProjectStep({
                            id: "swap_values",
                            title: K.projectStepTitle("swap_values") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_vars_swap_values_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                        makeProjectStep({
                            id: "running_total",
                            title: K.projectStepTitle("running_total") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_vars_running_total_code",
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
        pool: M1_VARS_POOL,
    }) satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };