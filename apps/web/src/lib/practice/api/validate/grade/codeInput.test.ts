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
});
