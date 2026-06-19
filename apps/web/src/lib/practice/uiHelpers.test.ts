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
                outputText: "/workspace",
                cwd: "/workspace",
            },
        });
    });
    it("uses visible terminal transcript as submit-time fallback for shell workspace answers", () => {
        const previousDocument = globalThis.document;

        const transcript = {
            textContent:
                "[zoeskoul]~$ mkdir -p semester/notes semester/assignments semester/scripts backups\n",
        };

        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {
                querySelectorAll: () => [transcript],
            },
        });

        try {
            const answer = buildSubmitAnswerFromItem({
                exercise: {
                    kind: "code_input",
                    language: "bash",
                    id: "ex-shell-folders",
                    topic: "linux.terminal",
                    difficulty: "easy",
                    title: "Create folders",
                    prompt: "Create folders",
                },
                code: "",
                source: "",
                codeLang: "bash",
            } as any);

            expect(answer).toMatchObject({
                kind: "code_input",
                language: "bash",
                code: "",
                terminalEvidence: {
                    outputText: expect.stringContaining("mkdir -p semester/notes"),
                },
                files: expect.arrayContaining([
                    expect.objectContaining({ kind: "directory", path: "semester" }),
                    expect.objectContaining({ kind: "directory", path: "semester/notes" }),
                    expect.objectContaining({ kind: "directory", path: "backups" }),
                ]),
            });
        } finally {
            Object.defineProperty(globalThis, "document", {
                configurable: true,
                value: previousDocument,
            });
        }
    });

    it("preserves prompt boundaries when visible terminal fallback includes multiple commands", () => {
        const previousDocument = globalThis.document;

        const transcript = {
            textContent:
                "[starting workspace terminal][zoeskoul]~$ mkdir -p semester/notes semester/assignments semester/scripts backups[zoeskoul]~$ ls semester",
        };

        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: {
                querySelectorAll: () => [transcript],
            },
        });

        try {
            const answer = buildSubmitAnswerFromItem({
                exercise: {
                    kind: "code_input",
                    language: "bash",
                    id: "ex-shell-folders",
                    topic: "linux.terminal",
                    difficulty: "easy",
                    title: "Create folders",
                    prompt: "Create folders",
                },
                code: "",
                source: "",
                codeLang: "bash",
            } as any);

            expect(answer).toMatchObject({
                kind: "code_input",
                terminalEvidence: {
                    outputText: expect.stringContaining(
                        "[zoeskoul]~$ mkdir -p semester/notes semester/assignments semester/scripts backups\n[zoeskoul]~$ ls semester",
                    ),
                },
                files: expect.arrayContaining([
                    expect.objectContaining({ kind: "directory", path: "semester" }),
                    expect.objectContaining({ kind: "directory", path: "semester/notes" }),
                    expect.objectContaining({ kind: "directory", path: "backups" }),
                ]),
            });
        } finally {
            Object.defineProperty(globalThis, "document", {
                configurable: true,
                value: previousDocument,
            });
        }
    });

    it("rebuilds the capstone handoff workspace from terminal evidence after stale intermediate shell state", () => {
        const answer = buildSubmitAnswerFromItem({
            exercise: {
                kind: "code_input",
                language: "bash",
                id: "ci-capstone-finish-handoff",
                topic: "linux-terminal-fundamentals.linux-3-file-room-capstone.final-file-room-capstone",
                difficulty: "easy",
                title: "Finish the handoff",
                prompt: "Finish the handoff",
            },
            code: "",
            source: "",
            codeLang: "bash",
            workspace: {
                version: 2,
                language: "bash",
                nodes: [
                    {
                        id: "dir:event-room",
                        kind: "folder",
                        name: "event-room",
                        parentId: null,
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "dir:event-room/notes",
                        kind: "folder",
                        name: "notes",
                        parentId: "dir:event-room",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "dir:event-room/scripts",
                        kind: "folder",
                        name: "scripts",
                        parentId: "dir:event-room",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "dir:event-room/archive",
                        kind: "folder",
                        name: "archive",
                        parentId: "dir:event-room",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "dir:event-room/incoming",
                        kind: "folder",
                        name: "incoming",
                        parentId: "dir:event-room",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "file:setup",
                        kind: "file",
                        name: "setup.sh",
                        parentId: "dir:event-room/scripts",
                        content: "echo setup lights\n",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "file:guests",
                        kind: "file",
                        name: "guests.txt",
                        parentId: "dir:event-room/archive",
                        content: "Ari\nSam\nMina\n",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "file:oldtmp",
                        kind: "file",
                        name: "old.tmp",
                        parentId: "dir:event-room/incoming",
                        content: "delete after cleanup\n",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                    {
                        id: "file:main",
                        kind: "file",
                        name: "main.sh",
                        parentId: null,
                        content: "",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                ],
                openTabs: ["file:main"],
                activeFileId: "file:main",
                entryFileId: "file:main",
                stdin: "",
                expanded: ["dir:event-room"],
                leftPct: 26,
            },
            terminalEvidence: {
                outputText:
                    "[zoeskoul]~$ mv event-room/notes/agenda.txt backups/agenda-backup.txt\n" +
                    "mv: cannot move 'event-room/notes/agenda.txt' to 'backups/agenda-backup.txt': No such file or directory\n" +
                    "[zoeskoul]~$ mkdir backups\n" +
                    "[zoeskoul]~$ mv event-room/notes/agenda.txt backups/agenda-backup.txt\n" +
                    "[zoeskoul]~$ mv backups/agenda-backup.txt event-room/notes/agenda.txt\n" +
                    "[zoeskoul]~$ cp backups/agenda-backup.txt event-room/notes/agenda.txt\n" +
                    "cp: cannot stat 'backups/agenda-backup.txt': No such file or directory\n" +
                    "[zoeskoul]~$ cp event-room/notes/agenda.txt backups/agenda-backup.txt\n" +
                    "[zoeskoul]~$ rm event-room/incoming/old.tmp\n" +
                    "[zoeskoul]~$ touch event-room/ready.txt\n",
            },
        } as any);

        expect(answer).toMatchObject({
            kind: "code_input",
            language: "bash",
            files: expect.arrayContaining([
                expect.objectContaining({ kind: "directory", path: "backups" }),
                expect.objectContaining({ path: "event-room/notes/agenda.txt" }),
                expect.objectContaining({ path: "backups/agenda-backup.txt" }),
                expect.objectContaining({ path: "event-room/ready.txt" }),
            ]),
        });
        expect((answer as any).files).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: "event-room/incoming/old.tmp" }),
            ]),
        );
    });

});
