import { describe, expect, it } from "vitest";

import { buildSubmitAnswerFromItem } from "./uiHelpers";

describe("buildSubmitAnswerFromItem", () => {
    it("includes workspace files for multi-file code_input answers", () => {
        const answer = buildSubmitAnswerFromItem({
            exercise: {
                kind: "code_input",
                language: "python",
                id: "ex-1",
                topic: "python.files",
                difficulty: "easy",
                title: "Files",
                prompt: "Read a file",
            },
            code: 'with open("data.txt") as file:\n    print(file.read())\n',
            source: 'with open("data.txt") as file:\n    print(file.read())\n',
            codeLang: "python",
            codeStdin: "",
            workspace: {
                version: 2,
                language: "python",
                nodes: [
                    {
                        id: "file:main.py",
                        kind: "file",
                        name: "main.py",
                        parentId: null,
                        content: 'with open("data.txt") as file:\n    print(file.read())\n',
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "file:data.txt",
                        kind: "file",
                        name: "data.txt",
                        parentId: null,
                        content: "fixture\n",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                ],
                openTabs: ["file:main.py"],
                activeFileId: "file:main.py",
                entryFileId: "file:main.py",
                stdin: "",
                expanded: [],
                leftPct: 26,
            },
        } as any);

        expect(answer).toMatchObject({
            kind: "code_input",
            language: "python",
            code: 'with open("data.txt") as file:\n    print(file.read())',
            entry: "main.py",
            files: expect.arrayContaining([
                expect.objectContaining({
                    path: "main.py",
                    content: 'with open("data.txt") as file:\n    print(file.read())\n',
                }),
                expect.objectContaining({
                    path: "data.txt",
                    content: "fixture\n",
                }),
            ]),
        });
    });

    it("prefers the workspace entry file over stale item.code for code_input answers", () => {
        const answer = buildSubmitAnswerFromItem({
            exercise: {
                kind: "code_input",
                language: "python",
                id: "ex-1",
                topic: "python.files",
                difficulty: "easy",
                title: "Files",
                prompt: "Read a file",
            },
            code: "print('stale code')\n",
            source: "print('stale code')\n",
            codeLang: "python",
            workspace: {
                version: 2,
                language: "python",
                nodes: [
                    {
                        id: "file:main.py",
                        kind: "file",
                        name: "main.py",
                        parentId: null,
                        content: 'with open("data.txt") as file:\n    print(file.read())\n',
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "file:data.txt",
                        kind: "file",
                        name: "data.txt",
                        parentId: null,
                        content: "fixture\n",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                ],
                openTabs: ["file:main.py"],
                activeFileId: "file:main.py",
                entryFileId: "file:main.py",
                stdin: "",
                expanded: [],
                leftPct: 26,
            },
        } as any);

        expect(answer).toMatchObject({
            kind: "code_input",
            code: 'with open("data.txt") as file:\n    print(file.read())',
            entry: "main.py",
            files: expect.arrayContaining([
                expect.objectContaining({
                    path: "data.txt",
                    content: "fixture\n",
                }),
            ]),
        });
        expect((answer as any).code).not.toContain("stale code");
        expect((answer as any).terminalEvidence).toBeUndefined();
    });

    it("includes terminal evidence for terminal_workspace shell_task answers", () => {
        const answer = buildSubmitAnswerFromItem({
            exercise: {
                kind: "code_input",
                language: "bash",
                id: "ex-shell-1",
                topic: "linux.terminal",
                difficulty: "easy",
                title: "Use pwd",
                prompt: "Run pwd",
            },
            code: "",
            source: "",
            codeLang: "bash",
            codeStdin: "",
            terminalEvidence: {
                commands: ["pwd"],
                outputText: "/workspace\n",
                cwd: "/workspace",
            },
        } as any);

        expect(answer).toEqual({
            kind: "code_input",
            language: "bash",
            code: "",
            stdin: "",
            terminalEvidence: {
                commands: ["pwd"],
                outputText: "/workspace\n",
                cwd: "/workspace",
            },
        });
    });
});
