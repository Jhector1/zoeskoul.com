import { describe, expect, it } from "vitest";
import { buildTopicAuthoringDraftPrompt } from "./buildTopicAuthoringDraftPrompt.js";

describe("drag_reorder topic-authoring prompt contract", () => {
    it("requires correctOrder to copy the exact token strings", () => {
        const prompt = buildTopicAuthoringDraftPrompt({
            locale: "en",
            seed: {
                profileId: "sql",
                subjectSlug: "sql",
                courseSlug: "multi-table-sql",
                moduleSlug: "multi-table-sql-module-0-join-foundations",
                modulePrefix: "multi_table_sql_module_0",
                moduleOrder: 0,
                sectionSlug: "multi-table-sql-section-0-relationship-keys",
                sectionOrder: 0,
                topicId: "reading-keys-and-relationships",
                order: 0,
                title: "Reading Keys and Relationships",
                summary: "Trace documented primary-key and foreign-key pairs.",
                minutes: 18,
                sourceLocale: "en",
                targetLocales: [],
                plannedExerciseCounts: {
                    total: 6,
                    dominantKind: "single_choice",
                    counts: {
                        single_choice: 2,
                        multi_choice: 2,
                        drag_reorder: 1,
                        fill_blank_choice: 1,
                        code_input: 0,
                    },
                },
            } as any,
            shape: {} as any,
        });

        expect(prompt.system).toContain(
            "correctOrder must be a full permutation of tokens",
        );
        expect(prompt.system).toContain(
            "Copy every correctOrder entry exactly from tokens",
        );
        expect(prompt.system).toContain(
            "Never use answer letters (a, b, c, d), numeric positions, indexes, or invented ids",
        );
        expect(prompt.system).toContain(
            "If validation mentions drag_reorder, correctOrder, or tokens",
        );
    });
});
