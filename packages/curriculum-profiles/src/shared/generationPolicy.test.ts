import { describe, expect, it } from "vitest";
import type { CourseProfile } from "../types.js";
import { pythonShape } from "../shapes/pythonShape.js";
import {
    applyBaseCourseGenerationPolicy,
    baseCourseGenerationPolicy,
    createCodeInputProjectCapability,
    sharedPracticeProfileConfig,
} from "./generationPolicy.js";

describe("shared generation policy", () => {
    it("defines universal course-generation defaults once", () => {
        expect(baseCourseGenerationPolicy).toMatchObject({
            practice: {
                requireTryItForTeachingTopics: true,
                tryItPlacement: "all_sketches",
                requireTryItConceptAlignment: true,
            },
            quiz: {
                allowCodeInput: false,
                allowedKinds: [
                    "single_choice",
                    "multi_choice",
                    "drag_reorder",
                    "fill_blank_choice",
                ],
            },
            projects: {
                requireOneModuleProjectPerStandardModule: true,
                requireFinalCapstone: true,
                projectTopicSketchCount: 1,
                projectFlowDefault: "progressive",
                requireStepChaining: true,
            },
            exerciseKinds: {
                tryItPurpose: "try_it",
                practicePurpose: "practice",
                quizPurpose: "quiz",
                projectPurpose: "project",
            },
        });
    });

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

    it("applies base practice and project policy to a generic profile without per-course duplication", () => {
        const genericProfile = {
            id: "generic-course",
            shape: pythonShape,
            allowedExerciseKinds: [
                "single_choice",
                "multi_choice",
                "drag_reorder",
                "fill_blank_choice",
                "code_input",
            ],
            allowedRecipeTypes: [],
            buildModuleRuntimeDefaults() {
                return null;
            },
            getRecipeRegistry() {
                return {};
            },
            validateTopicBundle() {
                return [];
            },
        } satisfies CourseProfile;

        const inherited = applyBaseCourseGenerationPolicy(genericProfile);

        expect(inherited.practice).toMatchObject({
            preferredTryItExerciseKind: "code_input",
            tryItDefault: {
                enabled: true,
                placement: "all_sketches",
            },
        });
        expect(inherited.project?.getProjectConfig({
            seed: {} as any,
            topicKind: "module_project",
        })).toMatchObject({
            projectFlowDefault: "progressive",
            projectTitle: "Real-World Module Project",
            targetStepCount: 3,
        });
    });
});
