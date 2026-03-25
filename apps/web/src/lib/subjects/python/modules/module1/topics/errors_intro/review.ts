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

import { M1_ERRORS_POOL } from "./generator";
import {PY_MOD1, PY_SECTION_MOD1} from "@/lib/subjects/python/modules/module1/meta";

const MINUTES = 10 as const;

const PK = {
    code_input: "code_input" as PracticeKind,
    single_choice: "single_choice" as PracticeKind,
} as const;



export const ERRORS_INTRO_REVIEW = {
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
                sketchId: "py.types.errors",
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
                            id: "identify_error",
                            title: K.projectStepTitle("identify_error") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.single_choice,
                            exerciseKey: "m1_types_errors_sc",
                            seedPolicy: "global",
                            maxAttempts: 3,
                        }),
                        makeProjectStep({
                            id: "fix_type_mismatch",
                            title: K.projectStepTitle("fix_type_mismatch") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_err_fix_type_mismatch_code",
                            seedPolicy: "global",
                            maxAttempts: 10,
                        }),
                        makeProjectStep({
                            id: "avoid_valueerror",
                            title: K.projectStepTitle("avoid_valueerror") as any,
                            topic: TOPIC_SLUG,
                            difficulty: "easy",
                            preferKind: PK.code_input,
                            exerciseKey: "m1_err_parse_age_safely_code",
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
        pool: M1_ERRORS_POOL,
    }) satisfies TopicDefInput,
} satisfies { topic: ReviewTopicShape; def: TopicDefInput };