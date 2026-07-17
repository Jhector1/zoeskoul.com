import { describe, expect, it } from "vitest";
import { buildTopicAuthoringDraftPrompt } from "./buildTopicAuthoringDraftPrompt.js";

describe("topic authoring exact exercise contract", () => {
    it("places exact topic goals and a final per-kind count gate in the prompt", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                subjectSlug: "sql",
                courseSlug: "multi-table-sql",
                moduleSlug: "multi-table-sql-module-2-outer-joins-and-accurate-counts",
                modulePrefix: "multi_table_sql_module_2",
                moduleOrder: 2,
                sectionSlug: "multi-table-sql-section-2-missing-and-counts",
                sectionOrder: 2,
                topicId: "counting-related-rows-without-inflation",
                order: 3,
                title: "Counting Related Rows Without Inflation",
                summary: "Count related rows without duplicate inflation.",
                topicLearningGoals: [
                    "Use COUNT(right_table.id) so unmatched rows produce zero.",
                    "Use COUNT(DISTINCT entity_id) for unique-entity metrics.",
                ],
                minutes: 20,
                sourceLocale: "en",
                targetLocales: [],
                plannedExerciseCounts: {
                    total: 8,
                    dominantKind: "multi_choice",
                    counts: {
                        single_choice: 1,
                        multi_choice: 2,
                        drag_reorder: 1,
                        fill_blank_choice: 2,
                        code_input: 2,
                    },
                },
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain(
            "AUTHORITATIVE TOPIC LEARNING GOALS:",
        );
        expect(prompt.system).toContain(
            "Use COUNT(right_table.id) so unmatched rows produce zero.",
        );
        expect(prompt.system).toContain(
            "FINAL EXERCISE COUNT GATE",
        );
        expect(prompt.system).toContain(
            "quizDraft must contain exactly 8 array items total",
        );
        expect(prompt.system).toContain(
            "multi_choice: exactly 2",
        );
        expect(prompt.system).toContain(
            "code_input: exactly 2",
        );
        expect(prompt.system).toContain(
            "starterCode must be incomplete learner scaffolding",
        );
    });
});
