import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    gradeProgrammingCodeInputMock,
    gradeSqlCodeInputMock,
} = vi.hoisted(() => ({
    gradeProgrammingCodeInputMock: vi.fn(),
    gradeSqlCodeInputMock: vi.fn(),
}));

vi.mock("./codeInput.programming", () => ({
    gradeProgrammingCodeInput: gradeProgrammingCodeInputMock,
}));

vi.mock("./codeInput.sql", () => ({
    gradeSqlCodeInput: gradeSqlCodeInputMock,
}));

import { gradeCodeInput } from "./codeInput";

describe("gradeCodeInput", () => {
    beforeEach(() => {
        gradeProgrammingCodeInputMock.mockReset();
        gradeSqlCodeInputMock.mockReset();
        gradeProgrammingCodeInputMock.mockResolvedValue({
            ok: true,
            explanation: "Correct.",
            feedback: null,
        });
    });

    it("marks terminal_workspace shell_task submissions for workspace-only grading", async () => {
        await gradeCodeInput({
            instance: {} as any,
            expectedCanon: {
                kind: "code_input",
                recipeType: "shell_task",
                shellTaskMode: "terminal_workspace",
                tests: [
                    {
                        stdout: "",
                        match: "includes",
                    },
                ],
                workspaceExpectations: {
                    requiredFolders: ["linux-lab/notes"],
                    requiredFiles: ["linux-lab/notes/today.txt"],
                },
            },
            answer: {
                kind: "code_input",
                language: "bash",
                code: "",
                entry: "linux-lab/notes/today.txt",
                files: [
                    {
                        kind: "directory",
                        path: "linux-lab",
                    },
                    {
                        kind: "directory",
                        path: "linux-lab/notes",
                    },
                    {
                        kind: "file",
                        path: "linux-lab/notes/today.txt",
                        content: "checked from terminal\n",
                    },
                ],
            },
            showDebug: false,
        });

        expect(gradeProgrammingCodeInputMock).toHaveBeenCalledWith(
            expect.objectContaining({
                terminalWorkspaceShellTask: true,
                language: "bash",
                entry: "linux-lab/notes/today.txt",
                files: expect.arrayContaining([
                    expect.objectContaining({
                        kind: "directory",
                        path: "linux-lab/notes",
                    }),
                    expect.objectContaining({
                        kind: "file",
                        path: "linux-lab/notes/today.txt",
                        content: "checked from terminal\n",
                    }),
                ]),
            }),
        );
        expect(gradeSqlCodeInputMock).not.toHaveBeenCalled();
    });

    it("accepts terminal evidence submissions without code or workspace files", async () => {
        await gradeCodeInput({
            instance: {} as any,
            expectedCanon: {
                kind: "code_input",
                recipeType: "shell_task",
                shellTaskMode: "terminal_workspace",
                tests: [
                    {
                        stdout: "",
                        match: "includes",
                    },
                ],
                workspaceExpectations: {},
            },
            answer: {
                kind: "code_input",
                language: "bash",
                code: "",
                terminalEvidence: {
                    commands: ["pwd"],
                    outputText: "/workspace\n",
                    cwd: "/workspace",
                },
            },
            showDebug: false,
        });

        expect(gradeProgrammingCodeInputMock).toHaveBeenCalledWith(
            expect.objectContaining({
                language: "bash",
                code: "",
                entry: undefined,
                files: undefined,
            }),
        );
    });

    it("returns helpful feedback when terminal expectations exist but terminal evidence is missing", async () => {
        const result = await gradeCodeInput({
            instance: {} as any,
            expectedCanon: {
                kind: "code_input",
                recipeType: "shell_task",
                shellTaskMode: "terminal_workspace",
                tests: [
                    {
                        stdout: "",
                        match: "includes",
                    },
                ],
                workspaceExpectations: {},
                terminalExpectations: {
                    requiredCommands: [
                        {
                            pattern: "^pwd$",
                            message: "Run pwd.",
                        },
                    ],
                },
            },
            answer: {
                kind: "code_input",
                language: "bash",
                code: "",
            },
            showDebug: false,
        });

        expect(result.ok).toBe(false);
        expect(result.explanation).toContain("Run the required terminal command");
        expect(result.feedback?.title).toBe("Terminal activity missing");
        expect(gradeProgrammingCodeInputMock).not.toHaveBeenCalled();
    });
    it("preserves semanticChecks[].path through request-time schema parsing", async () => {
        await gradeCodeInput({
            instance: {} as any,
            expectedCanon: {
                kind: "code_input",
                strategy: "programming",
                language: "python",
                checkMode: "semantic",
                tests: [],
                semanticChecks: [
                    {
                        type: "defines_class",
                        path: "models/car.py",
                        className: "Car",
                    },
                ],
            },
            answer: {
                kind: "code_input",
                language: "python",
                code: "# main.py\n",
                entry: "main.py",
                files: [
                    {
                        kind: "file",
                        path: "main.py",
                        content: "# main.py\n",
                    },
                    {
                        kind: "file",
                        path: "models/car.py",
                        content: "class Car:\n    pass\n",
                    },
                ],
            },
            showDebug: false,
        });

        expect(gradeProgrammingCodeInputMock).toHaveBeenCalledWith(
            expect.objectContaining({
                expected: expect.objectContaining({
                    semanticChecks: [
                        expect.objectContaining({
                            type: "defines_class",
                            path: "models/car.py",
                            className: "Car",
                        }),
                    ],
                }),
            }),
        );
    });

});
