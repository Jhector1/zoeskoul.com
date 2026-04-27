
import { describe, expect, it } from "vitest";
import { normalizeTopicAuthoringDraft } from "./normalizeTopicAuthoringDraft.js";

describe("normalizeTopicAuthoringDraft", () => {
    it("normalizes missing arrays and trims basic strings", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "  Topic  ",
            summary: "  Summary  ",
            minutes: 15,
            sketchBlocks: undefined,
            quizDraft: undefined,
        } as any);

        expect(normalized.title).toBe("Topic");
        expect(normalized.summary).toBe("Summary");
        expect(Array.isArray(normalized.sketchBlocks)).toBe(true);
        expect(Array.isArray(normalized.quizDraft)).toBe(true);
    });

    it("preserves minutes when already numeric", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [],
        } as any);

        expect(normalized.minutes).toBe(20);
    });

    it("normalizes programming code_input tests", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input",
                    title: "Code",
                    prompt: "Prompt",
                    starterCode: "n = int(input())\n",
                    solutionCode: "n = int(input())\nprint(n + 1)\n",
                    tests: [
                        { stdin: "3\n", stdout: "4\n", match: "exact" },
                        { stdin: "5\n", stdout: "" },
                    ],
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                },
            ],
        } as any);

        const exercise = normalized.quizDraft[0] as any;
        expect(exercise.tests).toEqual([
            { stdin: "3\n", stdout: "4\n", match: "exact" },
        ]);
    });
});
