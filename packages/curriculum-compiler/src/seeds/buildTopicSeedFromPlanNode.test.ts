
import { describe, expect, it, vi } from "vitest";
import { stableJsonStringify } from "../reports/stableHash.js";

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
        expect(seed.plannedExerciseCounts?.total).toBe(11);
    });

    it("honors topic-level generation target overrides", () => {
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
                topicPolicies: {
                    conceptual_topic: {
                        generationTargets: {
                            quizBankMin: 4,
                            quizBankTarget: 5,
                            projectCodeInputMin: 0,
                            projectCodeInputTarget: 1,
                            projectCodeInputMax: 1,
                        },
                    },
                },
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
                topicId: "conceptual_topic",
                order: 1,
                title: "Topic 0",
                summary: "Summary",
                minutes: 15,
                learningGoals: ["Goal 1"],
            } as any,
        });

        expect(seed.generationTargets.quizBankTarget).toBe(5);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(1);
        expect(seed.plannedExerciseCounts?.total).toBe(6);
        expect(seed.plannedExerciseCounts?.counts.code_input).toBe(1);
    });

    it("builds stable topic seeds for the same inputs", () => {
        const args = {
            blueprint: {
                profileId: "python",
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
        };

        const first = buildTopicSeedFromPlanNode(args);
        const second = buildTopicSeedFromPlanNode(args);

        expect(stableJsonStringify(first)).toBe(stableJsonStringify(second));
    });
});
