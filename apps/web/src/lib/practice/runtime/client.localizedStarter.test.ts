import { describe, expect, it, vi } from "vitest";
import { fetchResolvedPracticeItem } from "@/lib/practice/runtime/client";

vi.mock("@/lib/practice/clientApi", async () => {
    return {
        fetchPracticeExercise: vi.fn(async () => ({
            key: "signed-practice-key",
            exercise: {
                id: "m1_s04_query_one_column_name",
                kind: "code_input",
                title: "@:quiz.m1_s04_query_one_column_name.title",
                prompt: "@:quiz.m1_s04_query_one_column_name.prompt",
                language: "sql",
                starterCode: "@:quiz.m1_s04_query_one_column_name.starterCode",
            },
            run: {
                maxAttempts: 3,
                allowReveal: true,
            },
        })),
        fetchPracticeHelp: vi.fn(),
        submitPracticeAnswer: vi.fn(),
    };
});

describe("fetchResolvedPracticeItem localized starter code", () => {
    it("resolves tagged starterCode before initializing the practice editor item", async () => {
        const loaded = await fetchResolvedPracticeItem({
            request: {
                subject: "sql",
                module: "sql_module_1",
                section: "section_1_1",
                topic: "practice_with_basic_queries",
                difficulty: "easy",
                exerciseKey: "m1_s04_query_one_column_name",
            },
            resolvers: {
                raw: (key) => {
                    if (key === "quiz.m1_s04_query_one_column_name.starterCode") {
                        return "-- Return only product names\n";
                    }

                    return `resolved:${key}`;
                },
                resolveText: (value) => value,
            },
        });

        expect((loaded.exercise as Extract<typeof loaded.exercise, { kind: "code_input" }>).starterCode).toBe("-- Return only product names\n");
        expect(loaded.item.code).toBe("-- Return only product names\n");
        expect(JSON.stringify(loaded.item)).not.toContain("@:");
    });
});
