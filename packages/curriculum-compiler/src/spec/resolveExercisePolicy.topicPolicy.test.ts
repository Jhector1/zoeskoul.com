import { describe, expect, it } from "vitest";

import { resolveExercisePolicy } from "./resolveExercisePolicy.js";

describe("resolveExercisePolicy topic-specific practice kinds", () => {
    it("prefers topic expectedPracticeKinds over module and course mixes", () => {
        const result = resolveExercisePolicy({
            blueprint: {
                profileId: "language",
            } as any,
            spec: {
                modules: [
                    {
                        moduleSlug: "m1",
                        exercisePolicy: {
                            mix: {
                                fill_blank_choice: 1,
                            },
                        },
                    },
                ],
                policy: {
                    exercisePolicy: {
                        defaultMix: {
                            single_choice: 1,
                        },
                    },
                },
                topicPolicies: {
                    listening: {
                        expectedPracticeKinds: [
                            "listen_build",
                            "voice_input",
                            "word_bank_arrange",
                            "text_input",
                        ],
                    },
                },
            } as any,
            moduleSlug: "m1",
            topicId: "listening",
        });

        expect(result.source).toBe("topic_spec");

        expect(result.mix.listen_build).toBe(0.25);
        expect(result.mix.voice_input).toBe(0.25);
        expect(result.mix.word_bank_arrange).toBe(0.25);
        expect(result.mix.text_input).toBe(0.25);

        expect(result.mix.fill_blank_choice).toBe(0);
        expect(result.mix.single_choice).toBe(0);
    });

    it("preserves module fallback without topic-specific kinds", () => {
        const result = resolveExercisePolicy({
            blueprint: {
                profileId: "language",
            } as any,
            spec: {
                modules: [
                    {
                        moduleSlug: "m1",
                        exercisePolicy: {
                            mix: {
                                fill_blank_choice: 1,
                            },
                        },
                    },
                ],
            } as any,
            moduleSlug: "m1",
            topicId: "ordinary-topic",
        });

        expect(result.source).toBe("module_spec");
        expect(result.mix.fill_blank_choice).toBe(1);
    });
});
