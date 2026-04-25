import { describe, expect, it } from "vitest";
import { buildMultiChoiceCompletenessIssues } from "./buildMultiChoiceCompletenessIssues.js";

describe("buildMultiChoiceCompletenessIssues", () => {
    it("flags suspicious multi_choice exercises with only one correct answer when the prompt implies multiple", () => {
        const issues = buildMultiChoiceCompletenessIssues({
            draft: {
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [
                    {
                        id: "multi-choice-1",
                        kind: "multi_choice",
                        title: "Which are real-world uses of databases?",
                        prompt: "Select all scenarios where a database is likely used.",
                        hint: "Think about digital systems that need to organize lots of information.",
                        help: {
                            concept: "Databases are used to store and manage large amounts of structured data electronically.",
                            hint_1: "If it's digital and tracks lots of information, it's probably a database.",
                            hint_2: "Manual lists aren't databases, but apps and systems that store data are.",
                        },
                        options: [
                            "An online store tracking customer orders",
                            "A library cataloging books and borrowers",
                            "A handwritten list of chores on a fridge",
                            "A social media app storing user posts",
                        ],
                        correctOptionIds: ["a"],
                    },
                ],
            } as any,
        });

        expect(
            issues.some(
                (issue) =>
                    issue.code === "MULTI_CHOICE_TOO_FEW_CORRECT_OPTIONS",
            ),
        ).toBe(true);
    });
});