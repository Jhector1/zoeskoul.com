import { describe, expect, it } from "vitest";
import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import { repairBashDraft } from "./repairBashDraft.js";

function fillBlank(id: string): TopicAuthoringDraft["quizDraft"][number] {
    return {
        id,
        kind: "fill_blank_choice",
        title: "Fill",
        prompt: "Complete the sentence.",
        hint: "Think command.",
        help: {
            concept: "Linux terminal basics.",
            hint_1: "Use the command idea.",
            hint_2: "A terminal runs commands.",
        },
        template: "A terminal runs a [blank1].",
        choices: ["command", "picture", "spreadsheet"],
        correctValue: "command",
    };
}

function makeSeed(counts: Partial<Record<string, number>>): TopicSeed {
    const fullCounts = {
        single_choice: 0,
        multi_choice: 0,
        drag_reorder: 0,
        fill_blank_choice: 0,
        code_input: 0,
        ...counts,
    };

    return {
        topicId: "future-linux-topic",
        title: "Future Linux Topic",
        profileId: "bash",
        plannedExerciseCounts: {
            total: Object.values(fullCounts).reduce((sum, value) => sum + Number(value), 0),
            dominantKind: fullCounts.code_input > 0 ? "code_input" : "single_choice",
            counts: fullCounts,
        },
    } as unknown as TopicSeed;
}

describe("repairBashDraft", () => {
    it("inherits shared non-code balancing without Linux-course-specific topic IDs", async () => {
        const draft: TopicAuthoringDraft = {
            title: "Future Linux Topic",
            summary: "Intro",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                fillBlank("fill-1"),
                fillBlank("fill-2"),
                fillBlank("fill-3"),
            ],
        };

        const result = await repairBashDraft({
            seed: makeSeed({ single_choice: 1, fill_blank_choice: 1 }),
            draft,
        });

        expect(result.draft.quizDraft.filter((exercise) => exercise.kind === "single_choice")).toHaveLength(1);
        expect(result.draft.quizDraft.filter((exercise) => exercise.kind === "fill_blank_choice")).toHaveLength(1);
        expect(result.draft.quizDraft.filter((exercise) => exercise.kind === "code_input")).toHaveLength(0);
        expect(result.draft.projectDraft).toBeUndefined();
    });

    it("normalizes authored Linux code_input exercises to Bash shell_task terminal_workspace", async () => {
        const draft: TopicAuthoringDraft = {
            title: "Future Linux Topic",
            summary: "Practice terminal tasks.",
            minutes: 16,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "authored-task",
                    kind: "code_input",
                    title: "Create the reports folder",
                    prompt: "Create a folder named reports.",
                    hint: "Use mkdir.",
                    help: {
                        concept: "mkdir creates folders.",
                        hint_1: "Use the exact folder name.",
                        hint_2: "Run ls after mkdir.",
                    },
                    starterCode: "# terminal task\n",
                    solutionCode: "mkdir -p reports\n",
                    recipeType: "fixed_tests",
                    fixedLanguage: "python",
                },
            ],
        };

        const result = await repairBashDraft({
            seed: makeSeed({ code_input: 1 }),
            draft,
        });
        const [exercise] = result.draft.quizDraft.filter(
            (item): item is Extract<TopicAuthoringDraft["quizDraft"][number], { kind: "code_input" }> =>
                item.kind === "code_input",
        );

        expect(exercise).toMatchObject({
            fixedLanguage: "bash",
            recipeType: "shell_task",
            mode: "terminal_workspace",
            entryFilePath: "main.sh",
        });
        expect(exercise.terminalExpectations?.forbiddenCommands?.[0]?.pattern).toContain("sudo");
        expect(result.draft.projectDraft?.stepIds).toEqual(["authored-task"]);
    });

    it("adds generic Bash terminal fallbacks only for missing code_input recipe details", async () => {
        const draft: TopicAuthoringDraft = {
            title: "Future Linux Topic",
            summary: "Practice terminal tasks.",
            minutes: 16,
            sketchBlocks: [],
            quizDraft: [],
        };

        const result = await repairBashDraft({
            seed: makeSeed({ code_input: 2 }),
            draft,
        });
        const codeInputs = result.draft.quizDraft.filter(
            (item): item is Extract<TopicAuthoringDraft["quizDraft"][number], { kind: "code_input" }> =>
                item.kind === "code_input",
        );

        expect(codeInputs).toHaveLength(2);
        expect(codeInputs.every((exercise) => exercise.fixedLanguage === "bash")).toBe(true);
        expect(codeInputs.every((exercise) => exercise.recipeType === "shell_task")).toBe(true);
        expect(codeInputs.every((exercise) => exercise.mode === "terminal_workspace")).toBe(true);
        expect(codeInputs.every((exercise) => Boolean(exercise.workspaceExpectations))).toBe(true);
        expect(codeInputs.map((exercise) => exercise.id).join("\n")).not.toContain("what-the-terminal-is");
    });
});
