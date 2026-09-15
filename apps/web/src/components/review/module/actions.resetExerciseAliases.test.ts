import { describe, expect, it } from "vitest";

import type { ReviewProgressState } from "@/lib/subjects/progressTypes";
import { buildQuizResetProgress } from "./actions";

describe("buildQuizResetProgress embedded exercise alias cleanup", () => {
    it("removes the stale parent-card practice alias while preserving unrelated parent-card state", () => {
        const topicId = "f-strings-and-formatting";
        const parentCardId = "f-strings-and-formatting_s0";
        const progressId = "try-f-strings-and-formatting-sketch0";
        const exerciseId = "ci_print_profile_line";

        const exerciseStateKey =
            "python-v2:python-v2-1:python-v2-python-v2-1-string-foundations:f-strings-and-formatting:f-strings-and-formatting_s0:ci_print_profile_line";

        const siblingExerciseKey =
            "python-v2:python-v2-1:python-v2-python-v2-1-string-foundations:f-strings-and-formatting:f-strings-and-formatting_s0:other-exercise";

        const staleWorkspace = {
            version: 2,
            language: "python",
            stdin: "",
            nodes: [
                {
                    id: "file:main.py",
                    kind: "file",
                    name: "main.py",
                    parentId: null,
                    content:
                        "# TODO: store the values in variables\n" +
                        "# TODO: print the sentence with an f-string\n" +
                        "ooppppphhhh",
                    createdAt: 0,
                    updatedAt: 0,
                },
            ],
            openTabs: ["file:main.py"],
            activeFileId: "file:main.py",
            entryFileId: "file:main.py",
            expanded: [],
            leftPct: 26,
        };

        const progress: ReviewProgressState = {
            topics: {
                [topicId]: {
                    readingDone: {
                        [parentCardId]: true,
                    },
                    cardsDone: {
                        [parentCardId]: true,
                    },
                    quizzesDone: {
                        [progressId]: true,
                    },
                    quizState: {
                        [progressId]: {
                            answers: {
                                temporary: "remove this embedded state",
                            },
                        } as any,

                        [parentCardId]: {
                            answers: {
                                preserveAnswer: "keep",
                            },
                            practiceItemPatch: {
                                [exerciseStateKey]: {
                                    exerciseKey: exerciseStateKey,
                                    exerciseId,
                                    cardId: parentCardId,
                                    workspace: staleWorkspace,
                                    userEdited: true,
                                    workspaceOrigin: "saved",
                                },

                                [siblingExerciseKey]: {
                                    exerciseKey: siblingExerciseKey,
                                    exerciseId: "other-exercise",
                                    cardId: parentCardId,
                                    code: "KEEP_SIBLING",
                                },
                            },
                        } as any,
                    },

                    runtimeStateV2: {
                        exercises: {
                            [exerciseStateKey]: {
                                exerciseKey: exerciseStateKey,
                                exerciseId,
                                cardId: parentCardId,
                                topicId,
                                code: "STALE_RUNTIME",
                                workspace: staleWorkspace,
                            },
                        },
                        cards: {},
                    },
                } as any,
            },
        };

        /*
         * Match the actual embedded Review reset shape:
         * progressId = embedded Try-it id
         * runtimeCardId = parent lesson card
         * exerciseId present
         * no exerciseStateKey required
         */
        const next = buildQuizResetProgress(progress, topicId, {
            progressId,
            runtimeCardId: parentCardId,
            cardProgressKeys: [parentCardId, progressId],
            exerciseId,
        });

        const nextTopic = next.topics?.[topicId] as any;

        // Embedded progress identity is reset.
        expect(nextTopic.quizState[progressId]).toBeUndefined();
        expect(nextTopic.quizzesDone[progressId]).toBeUndefined();

        // Parent lesson completion state is reset.
        expect(nextTopic.readingDone[parentCardId]).toBeUndefined();
        expect(nextTopic.cardsDone[parentCardId]).toBeUndefined();

        // Exact production stale compatibility alias is destroyed.
        expect(
            nextTopic.quizState[parentCardId].practiceItemPatch[
                exerciseStateKey
            ],
        ).toBeUndefined();

        // Unrelated exercise/state on the same parent card survives.
        expect(
            nextTopic.quizState[parentCardId].practiceItemPatch[
                siblingExerciseKey
            ],
        ).toEqual({
            exerciseKey: siblingExerciseKey,
            exerciseId: "other-exercise",
            cardId: parentCardId,
            code: "KEEP_SIBLING",
        });

        expect(nextTopic.quizState[parentCardId].answers).toEqual({
            preserveAnswer: "keep",
        });

        // Runtime stale owner is removed in the same reset transaction.
        expect(
            nextTopic.runtimeStateV2.exercises[exerciseStateKey],
        ).toBeUndefined();
    });
});
