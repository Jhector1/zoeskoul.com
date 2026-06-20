import { describe, expect, it } from "vitest";

import {
    getRequestedCodeSurface,
    isFullWorkspaceExercise,
    resolveCodeSurface,
    shouldUseWorkspaceCodeSurface,
} from "./workspaceExercise";

function buildExercise(overrides: Record<string, unknown> = {}) {
    return {
        kind: "code_input",
        id: "exercise-1",
        topic: "python.topic",
        difficulty: "easy",
        title: "Exercise",
        prompt: "Prompt",
        language: "python",
        ...overrides,
    } as any;
}

describe("isFullWorkspaceExercise", () => {
    it("treats supported root-level file sources as full workspace exercises", () => {
        const fileSourceKeys = [
            "starterFiles",
            "files",
            "initialFiles",
            "workspaceFiles",
            "fixtureFiles",
            "fixtures",
            "fileFixtures",
            "solutionFiles",
        ] as const;

        for (const key of fileSourceKeys) {
            expect(
                isFullWorkspaceExercise({
                    exercise: buildExercise({
                        [key]: {
                            "main.py": "print('hi')",
                        },
                    }),
                }),
            ).toBe(true);
        }
    });

    it("treats supported nested workspace file sources as full workspace exercises", () => {
        expect(
            isFullWorkspaceExercise({
                exercise: buildExercise({
                    workspace: {
                        fixtureFiles: {
                            "notes.txt": "hello",
                        },
                    },
                }),
            }),
        ).toBe(true);
    });
});

describe("code surface policy", () => {
    it("defaults simple code_input exercises to the Tools workspace", () => {
        const exercise = buildExercise({ starterCode: "print('hi')" });

        expect(getRequestedCodeSurface({ exercise })).toBe("auto");
        expect(isFullWorkspaceExercise({ exercise })).toBe(false);
        expect(resolveCodeSurface({ exercise })).toBe("tools");
        expect(shouldUseWorkspaceCodeSurface({ exercise })).toBe(true);
    });

    it("allows embedded code_input only when the manifest opts in and no workspace is required", () => {
        const exercise = buildExercise({
            starterCode: "print('tiny')",
            ui: { codeSurface: "embedded" },
        });

        expect(getRequestedCodeSurface({ exercise })).toBe("embedded");
        expect(resolveCodeSurface({ exercise })).toBe("embedded");
        expect(shouldUseWorkspaceCodeSurface({ exercise })).toBe(false);
    });

    it("forces Tools when embedded is requested but the exercise has files", () => {
        const exercise = buildExercise({
            ui: { codeSurface: "embedded" },
            workspace: {
                starterFiles: {
                    "main.py": "print('hi')",
                    "data/students.csv": "name,score\nAva,92",
                },
            },
        });

        expect(getRequestedCodeSurface({ exercise })).toBe("embedded");
        expect(isFullWorkspaceExercise({ exercise })).toBe(true);
        expect(resolveCodeSurface({ exercise })).toBe("tools");
    });

    it("accepts project-step surface hints but still lets workspace requirements win", () => {
        const exercise = buildExercise({ starterCode: "print('step')" });

        expect(
            resolveCodeSurface({
                exercise,
                projectStepManifest: {
                    id: "step-1",
                    ui: { codeSurface: "embedded" },
                } as any,
            }),
        ).toBe("embedded");

        expect(
            resolveCodeSurface({
                exercise,
                projectStepManifest: {
                    id: "step-1",
                    ui: { codeSurface: "embedded" },
                    starterFiles: { "main.py": "print('workspace')" },
                } as any,
            }),
        ).toBe("tools");
    });
});
