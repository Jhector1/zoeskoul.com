import { describe, expect, it } from "vitest";
import type {
    ManifestCodeInputCompilerInput,
} from "@zoeskoul/curriculum-contracts";
import { normalizeManifestCodeInputWorkspace } from "./normalizeManifestCodeInputWorkspace.js";

function baseExercise(
    overrides: Partial<ManifestCodeInputCompilerInput> = {},
): ManifestCodeInputCompilerInput {
    return {
        id: "canonical-workspace-test",
        kind: "code_input",
        purpose: "practice",
        weight: 1,
        messageBase: "topics.test.practice.canonical_workspace_test",
        language: "python",
        recipe: {
            type: "fixed_tests",
            solutionCode: "print('ok')",
            tests: [{ stdout: "ok" }],
        },
        ...overrides,
    };
}

describe("normalizeManifestCodeInputWorkspace", () => {
    it("hydrates workspace from temporary legacy aliases and strips them from normalized output", () => {
        const starterFiles = [
            {
                path: "main.py",
                content: "# main",
                language: "python" as const,
                isEntry: true,
                entry: true,
            },
            {
                path: "models/book.py",
                content: "class Book: ...",
                language: "python" as const,
                isEntry: false,
                entry: false,
            },
        ];

        const exercise = baseExercise({
            starterCode: "# main",
            starterFiles,
            workspace: {
                language: "python",
                entryFilePath: "main.py",
            },
        });

        const normalized = normalizeManifestCodeInputWorkspace(exercise);

        expect(normalized.workspace?.starterFiles).toEqual(starterFiles);
        expect("starterCode" in normalized).toBe(false);
        expect("starterFiles" in normalized).toBe(false);
    });

    it("keeps a workspace-only starter contract without recreating legacy aliases", () => {
        const workspaceStarterFiles = [
            {
                path: "main.py",
                content: "print('workspace only')",
                language: "python" as const,
                isEntry: true,
                entry: true,
            },
        ];

        const exercise = baseExercise({
            workspace: {
                language: "python",
                entryFilePath: "main.py",
                starterFiles: workspaceStarterFiles,
            },
        });

        const normalized = normalizeManifestCodeInputWorkspace(exercise);

        expect(normalized.workspace?.starterFiles).toEqual(
            workspaceStarterFiles,
        );
        expect("starterCode" in normalized).toBe(false);
        expect("starterFiles" in normalized).toBe(false);
    });

    it("converts a scalar-only legacy starter into the canonical entry file", () => {
        const normalized = normalizeManifestCodeInputWorkspace(
            baseExercise({ starterCode: "print('legacy')" }),
        );

        expect(normalized.workspace?.entryFilePath).toBe("main.py");
        expect(normalized.workspace?.starterFiles).toEqual([
            {
                path: "main.py",
                content: "print('legacy')",
                isEntry: true,
                entry: true,
            },
        ]);
        expect("starterCode" in (normalized.workspace ?? {})).toBe(false);
    });

    it("rejects conflicting starterFiles instead of silently choosing an alias", () => {
        const exercise = baseExercise({
            starterFiles: [
                {
                    path: "main.py",
                    content: "# main",
                    isEntry: true,
                    entry: true,
                },
                {
                    path: "models/book.py",
                    content: "class Book: ...",
                },
            ],
            workspace: {
                language: "python",
                entryFilePath: "main.py",
                starterFiles: [
                    {
                        path: "main.py",
                        content: "# main",
                        isEntry: true,
                        entry: true,
                    },
                ],
            },
        });

        expect(() =>
            normalizeManifestCodeInputWorkspace(exercise),
        ).toThrow(/Conflicting code_input starterFiles/);
    });

    it("rejects conflicting workspace expectations instead of weakening canonical grading requirements", () => {
        const exercise = baseExercise({
            workspaceExpectations: {
                requiredFiles: [
                    "data/students.csv",
                    "output/clean_students.csv",
                ],
                requiredFolders: ["data", "output"],
            },
            workspace: {
                language: "python",
                entryFilePath: "main.py",
                workspaceExpectations: {
                    requiredFiles: [
                        "data/students.csv",
                        "output/clean_students.csv",
                        "cleaning.py",
                    ],
                    requiredFolders: ["data", "output"],
                },
            },
        });

        expect(() =>
            normalizeManifestCodeInputWorkspace(exercise),
        ).toThrow(/Conflicting code_input workspaceExpectations/);
    });

    it("preserves equal aliases without mutating the input", () => {
        const expectations = {
            requiredFiles: ["helpers/formatting.py"],
            requiredFolders: ["helpers"],
        };
        const starterFiles = [
            {
                path: "main.py",
                content: "# start",
                isEntry: true,
                entry: true,
            },
        ];

        const exercise = baseExercise({
            starterCode: "# start",
            starterFiles,
            workspaceExpectations: expectations,
            workspace: {
                language: "python",
                entryFilePath: "main.py",
                starterFiles,
                workspaceExpectations: expectations,
            },
        });

        const before = JSON.stringify(exercise);
        const normalized = normalizeManifestCodeInputWorkspace(exercise);

        expect(normalized.workspace?.workspaceExpectations).toEqual(
            expectations,
        );
        expect(normalized.workspace?.starterFiles).toEqual(starterFiles);
        expect(JSON.stringify(exercise)).toBe(before);
        expect(normalized).not.toBe(exercise);
        expect(normalized.workspace).not.toBe(exercise.workspace);
    });
});
