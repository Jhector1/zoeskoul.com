import { describe, expect, it } from "vitest";
import {
    createCodeInputProjectCapability,
    sharedPracticeProfileConfig,
} from "./generationPolicy.js";

describe("shared generation policy", () => {
    it("defines shared try-it defaults for code-family profiles", () => {
        expect(sharedPracticeProfileConfig).toMatchObject({
            preferredTryItExerciseKind: "code_input",
            tryItDefault: {
                enabled: true,
                placement: "all_sketches",
                sketchIndex: 0,
                allowReveal: true,
            },
        });
    });

    it("creates a reusable minimal project capability for future code profiles", () => {
        const capability = createCodeInputProjectCapability();

        expect(
            capability.getProjectConfig({
                seed: {} as any,
                topicKind: "module_project",
            }),
        ).toMatchObject({
            minStepCount: 3,
            targetStepCount: 3,
            projectFlowDefault: "progressive",
        });

        expect(
            capability.getProjectConfig({
                seed: {} as any,
                topicKind: "capstone",
            }),
        ).toMatchObject({
            minStepCount: 5,
            targetStepCount: 5,
            projectFlowDefault: "progressive",
        });

        expect(
            capability.isProjectExercise({
                exercise: { kind: "code_input" } as any,
                seed: {} as any,
                topicKind: "module_project",
            }),
        ).toBe(true);
    });

    it("lets a future code profile inherit shared policy with only a project exercise adapter", () => {
        const capability = createCodeInputProjectCapability({
            preferredProjectExerciseKind: "code_input",
        });

        const config = capability.getProjectConfig({
            seed: {} as any,
            topicKind: "module_project",
        });

        expect(config.tryItDefault).toMatchObject({
            enabled: true,
            placement: "all_sketches",
            allowReveal: true,
        });
        expect(config.projectFlowDefault).toBe("progressive");
        expect(
            capability.isProjectExercise({
                exercise: { kind: "code_input" } as any,
                seed: {} as any,
                topicKind: "module_project",
            }),
        ).toBe(true);
    });

});
