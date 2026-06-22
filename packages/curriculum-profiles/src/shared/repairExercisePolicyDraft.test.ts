import { describe, expect, it } from "vitest";
import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import { repairDraftToPlannedExerciseCounts } from "./repairExercisePolicyDraft.js";

function fillBlank(id: string): TopicAuthoringDraft["quizDraft"][number] {
    return {
        id,
        kind: "fill_blank_choice",
        title: "Fill",
        prompt: "Complete the sentence.",
        hint: "Think about the lesson goal.",
        help: {
            concept: "Shared generation policy.",
            hint_1: "Use the lesson concept.",
            hint_2: "Pick the best matching word.",
        },
        template: "A lesson has a ____.",
        choices: ["goal", "shortcut", "mistake"],
        correctValue: "goal",
    };
}

describe("repairDraftToPlannedExerciseCounts", () => {
    it("trims and fills non-code exercises from the shared planned-count policy", () => {
        const seed = {
            topicId: "what-a-tool-is",
            title: "What a Tool Is",
            profileId: "python",
            plannedExerciseCounts: {
                total: 5,
                dominantKind: "single_choice",
                counts: {
                    single_choice: 2,
                    multi_choice: 1,
                    drag_reorder: 1,
                    fill_blank_choice: 1,
                    code_input: 0,
                },
            },
        } as unknown as TopicSeed;

        const draft: TopicAuthoringDraft = {
            title: "What a Tool Is",
            summary: "Intro",
            minutes: 10,
            sketchBlocks: [],
            quizDraft: [
                fillBlank("fill-1"),
                fillBlank("fill-2"),
                fillBlank("fill-3"),
                fillBlank("fill-4"),
                fillBlank("fill-5"),
            ],
        };

        const result = repairDraftToPlannedExerciseCounts({ seed, draft });

        expect(result.draft.quizDraft.filter((exercise) => exercise.kind === "single_choice")).toHaveLength(2);
        expect(result.draft.quizDraft.filter((exercise) => exercise.kind === "multi_choice")).toHaveLength(1);
        expect(result.draft.quizDraft.filter((exercise) => exercise.kind === "drag_reorder")).toHaveLength(1);
        expect(result.draft.quizDraft.filter((exercise) => exercise.kind === "fill_blank_choice")).toHaveLength(1);
        expect(result.draft.quizDraft.filter((exercise) => exercise.kind === "code_input")).toHaveLength(0);
        expect(result.report.repairs.map((repair) => repair.code)).toContain("EXERCISE_POLICY_KIND_OVER_TARGET_TRIMMED");
        expect(result.report.repairs.map((repair) => repair.code)).toContain("EXERCISE_POLICY_KIND_UNDER_TARGET_FILLED");
    });
});
