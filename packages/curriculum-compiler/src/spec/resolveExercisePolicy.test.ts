
import { describe, expect, it } from "vitest";
import { resolveExercisePolicy } from "./resolveExercisePolicy.js";

describe("resolveExercisePolicy", () => {
    it("prefers module_spec mix over course default mix", () => {
        const result = resolveExercisePolicy({
            blueprint: {
                profileId: "sql",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.2,
                },
            } as any,
            spec: {
                modules: [
                    {
                        moduleSlug: "m0",
                        exercisePolicy: {
                            mix: {
                                single_choice: 0.4,
                                multi_choice: 0.1,
                                drag_reorder: 0.1,
                                fill_blank_choice: 0.2,
                                code_input: 0.2,
                            },
                        },
                    },
                ],
                policy: {
                    exercisePolicy: {
                        defaultMix: {
                            single_choice: 0.1,
                            multi_choice: 0.1,
                            drag_reorder: 0.1,
                            fill_blank_choice: 0.3,
                            code_input: 0.4,
                        },
                    },
                },
            } as any,
            moduleSlug: "m0",
        });

        expect(result.source).toBe("module_spec");
        expect(result.mix.single_choice).toBe(0.4);
    });

    it("falls back to course_spec default mix when module mix is absent", () => {
        const result = resolveExercisePolicy({
            blueprint: {
                profileId: "sql",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.2,
                },
            } as any,
            spec: {
                modules: [{ moduleSlug: "m0" }],
                policy: {
                    exercisePolicy: {
                        defaultMix: {
                            single_choice: 0.1,
                            multi_choice: 0.1,
                            drag_reorder: 0.1,
                            fill_blank_choice: 0.3,
                            code_input: 0.4,
                        },
                    },
                },
            } as any,
            moduleSlug: "m0",
        });

        expect(result.source).toBe("course_spec");
        expect(result.mix.code_input).toBe(0.4);
    });

    it("normalizes a mix to sum to 1", () => {
        const result = resolveExercisePolicy({
            blueprint: {
                profileId: "sql",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.2,
                },
            } as any,
            spec: {
                modules: [
                    {
                        moduleSlug: "m0",
                        exercisePolicy: {
                            mix: {
                                single_choice: 2,
                                multi_choice: 2,
                                drag_reorder: 1,
                                fill_blank_choice: 3,
                                code_input: 2,
                            },
                        },
                    },
                ],
            } as any,
            moduleSlug: "m0",
        });

        const sum = Object.values(result.mix).reduce((acc, n) => acc + n, 0);
        expect(sum).toBeCloseTo(1, 10);
    });
});