
import { describe, expect, it, vi } from "vitest";

vi.mock("@zoeskoul/curriculum-profiles", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@zoeskoul/curriculum-profiles")>();

    return {
        ...actual,
        getProfileExercisePolicy: vi.fn(() => ({
            total: 11,
            dominantKind: "code_input",
            counts: {
                single_choice: 2,
                multi_choice: 2,
                drag_reorder: 2,
                fill_blank_choice: 2,
                code_input: 3,
            },
        })),
        getSqlModuleDatasetPolicy: vi.fn(() => ({
            datasetId: "orders",
        })),
    };
});

import { buildTopicSeedFromPlanNode } from "./buildTopicSeedFromPlanNode.js";

describe("buildTopicSeedFromPlanNode", () => {
    it("attaches exercisePolicy and plannedExerciseCounts", () => {
        const seed = buildTopicSeedFromPlanNode({
            blueprint: {
                profileId: "sql",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.2,
                },
            } as any,
            spec: {
                modules: [],
            } as any,
            module: {
                moduleSlug: "m0",
                title: "Module 0",
                order: 1,
                purpose: "Intro",
                learningObjectives: ["Obj 1"],
                guidedExercises: ["Ex 1"],
                quizFocus: ["Focus 1"],
                moduleProject: "Proj",
            } as any,
            section: {
                sectionSlug: "s0",
                title: "Section 0",
                order: 1,
            } as any,
            topic: {
                topicId: "t0",
                order: 1,
                title: "Topic 0",
                summary: "Summary",
                minutes: 15,
                learningGoals: ["Goal 1"],
            } as any,
        });

        expect(seed.exercisePolicy).toBeDefined();
        expect(seed.plannedExerciseCounts).toBeDefined();
        expect(seed.plannedExerciseCounts?.total).toBe(11);    });
});