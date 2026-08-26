import { describe, expect, it, vi } from "vitest";
import {
    fetchResolvedPracticeItem,
    normalizeCurrentPracticeItem,
} from "@/lib/practice/runtime/client";
import { deriveEntryCode } from "@zoeskoul/learning-runtime/review/module/runtime/exerciseWorkspaceResolver";

vi.mock("@/lib/practice/clientApi", async () => {
    return {
        fetchPracticeExercise: vi.fn(async () => ({
            key: "signed-practice-key",
            exercise: {
                id: "m1_s04_query_one_column_name",
                kind: "code_input",
                title: "@:quiz.m1_s04_query_one_column_name.title",
                prompt: "@:quiz.m1_s04_query_one_column_name.prompt",
                language: "sql",
                workspace: {
                    language: "sql",
                    entryFilePath: "query.sql",
                    starterCode: "@:quiz.m1_s04_query_one_column_name.starterCode",
                    starterFiles: [
                        {
                            path: "query.sql",
                            content: "@:quiz.m1_s04_query_one_column_name.starterCode",
                            isEntry: true,
                        },
                    ],
                },
            },
            run: {
                maxAttempts: 3,
                allowReveal: true,
            },
        })),
        fetchPracticeHelp: vi.fn(),
        submitPracticeAnswer: vi.fn(),
    };
});

describe("fetchResolvedPracticeItem localized starter code", () => {
    it("resolves tagged starterCode before initializing the practice editor item", async () => {
        const loaded = await fetchResolvedPracticeItem({
            request: {
                subject: "sql",
                module: "sql_module_1",
                section: "section_1_1",
                topic: "practice_with_basic_queries",
                difficulty: "easy",
                exerciseKey: "m1_s04_query_one_column_name",
            },
            resolvers: {
                raw: (key) => {
                    if (key === "quiz.m1_s04_query_one_column_name.starterCode") {
                        return "-- Return only product names\n";
                    }

                    return `resolved:${key}`;
                },
                resolveText: (value) => value,
            },
        });

        expect((loaded.exercise as any).workspace?.starterCode).toBe("-- Return only product names\n");
        expect(loaded.item.code).toBe("-- Return only product names\n");
        expect((loaded.item as any).workspace?.language).toBe("sql");
        expect(deriveEntryCode((loaded.item as any).workspace)).toBe("-- Return only product names\n");
        expect(JSON.stringify(loaded.item)).not.toContain("@:");
    });

    it("keeps live authored contract fields on the current practice item", () => {
        const normalized = normalizeCurrentPracticeItem(
            {
                key: "signed-practice-key",
                exercise: {
                    id: "q1",
                    kind: "code_input",
                    language: "python",
                },
                code: "print('starter')\n",
                codeLang: "python",
                codeStdin: "",
                stdin: "",
                single: "",
                multi: [],
                num: "",
                dragA: { x: 0, y: 0, z: 0 },
                dragB: { x: 0, y: 0, z: 0 },
                matRows: 0,
                matCols: 0,
                mat: [],
                result: null,
                submitted: false,
                text: "",
                help: {
                    openedStepKeys: [],
                    activeStepKey: null,
                    entries: {},
                    busyStepKey: null,
                    error: null,
                },
                voiceTranscript: "",
            } as any,
            {
                id: "q1",
                kind: "code_input",
                language: "sql",
                workspace: {
                    language: "sql",
                    entryFilePath: "query.sql",
                    starterCode: "-- live sql starter\n",
                    starterFiles: [
                        {
                            path: "query.sql",
                            content: "-- live sql starter\n",
                            isEntry: true,
                        },
                    ],
                },
                recipe: {
                    starterCode: "-- recipe sql starter\n",
                },
            } as any,
            {
                exercise: {
                    id: "q1",
                    kind: "code_input",
                    language: "sql",
                    workspace: {
                        language: "sql",
                        entryFilePath: "query.sql",
                        starterCode: "-- live sql starter\n",
                        starterFiles: [
                            {
                                path: "query.sql",
                                content: "-- live sql starter\n",
                                isEntry: true,
                            },
                        ],
                    },
                    recipe: {
                        starterCode: "-- recipe sql starter\n",
                    },
                },
            },
        );

        expect((normalized.exercise as any).language).toBe("sql");
        expect((normalized.exercise as any).workspace?.starterCode).toBe("-- live sql starter\n");
        expect((normalized.exercise as any).workspace?.starterFiles).toEqual([
            {
                path: "query.sql",
                content: "-- live sql starter\n",
                isEntry: true,
            },
        ]);
        expect((normalized.exercise as any).recipe).toEqual({
            starterCode: "-- recipe sql starter\n",
        });
        expect((normalized as any).workspace?.language).toBe("sql");
        expect((normalized as any).code).toBe("-- live sql starter\n");
    });

    it("keeps live ideConfig on the current practice item", () => {
        const normalized = normalizeCurrentPracticeItem(
            {
                key: "signed-practice-key",
                exercise: {
                    id: "linux-q1",
                    kind: "code_input",
                    language: "bash",
                },
                code: "",
                codeLang: "bash",
                codeStdin: "",
                stdin: "",
                single: "",
                multi: [],
                num: "",
                dragA: { x: 0, y: 0, z: 0 },
                dragB: { x: 0, y: 0, z: 0 },
                matRows: 0,
                matCols: 0,
                mat: [],
                result: null,
                submitted: false,
                text: "",
                help: {
                    openedStepKeys: [],
                    activeStepKey: null,
                    entries: {},
                    busyStepKey: null,
                    error: null,
                },
                voiceTranscript: "",
            } as any,
            {
                id: "linux-q1",
                kind: "code_input",
                language: "bash",
            } as any,
            {
                language: "bash",
                ideConfig: {
                    runnerBackend: "pty",
                    layoutMode: "terminal_workspace",
                    terminalSessionScope: "exercise",
                    terminalCwd: "/workspace/park-terminal-map",
                    requires: {
                        files: true,
                        multiFile: true,
                        terminal: true,
                    },
                },
            },
        );

        expect((normalized.exercise as any).ideConfig).toMatchObject({
            terminalSessionScope: "exercise",
            terminalCwd: "/workspace/park-terminal-map",
        });
        expect((normalized as any).ideConfig).toMatchObject({
            terminalSessionScope: "exercise",
            terminalCwd: "/workspace/park-terminal-map",
        });
    });

    it("hydrates starter-backed runtime workspace snapshots for canonical live multi-file practice items", () => {
        const starterCode =
            "with open('data.txt') as f:\n    print(f.read())\n";
        const authoredWorkspace = {
            language: "python",
            entryFilePath: "main.py",
            starterFiles: [
                {
                    path: "main.py",
                    content: starterCode,
                    isEntry: true,
                },
            ],
            files: [
                {
                    path: "data.txt",
                    content: "fixture line\n",
                },
            ],
        };

        const normalized = normalizeCurrentPracticeItem(
            {
                key: "signed-practice-key",
                exercise: {
                    id: "file-io-q1",
                    kind: "code_input",
                    language: "python",
                },
                code: "",
                codeLang: "python",
                codeStdin: "",
                stdin: "",
                workspaceOrigin: "starter",
            } as any,
            {
                id: "file-io-q1",
                kind: "code_input",
                language: "python",
                workspace: authoredWorkspace,
            } as any,
            {
                exercise: {
                    id: "file-io-q1",
                    kind: "code_input",
                    language: "python",
                    workspace: authoredWorkspace,
                },
            },
        );

        const paths = ((normalized as any).workspace?.nodes ?? [])
            .filter((node: any) => node?.kind === "file")
            .map((node: any) => String(node.name ?? ""));

        expect(paths).toEqual(
            expect.arrayContaining(["main.py", "data.txt"]),
        );
        expect(
            deriveEntryCode((normalized as any).workspace),
        ).toContain("with open('data.txt')");
        expect(
            (normalized.exercise as any).workspace,
        ).toBe(authoredWorkspace);
    })

    it("replaces a non-user single-file workspace when live starter workspace includes fixtures", () => {
        const normalized = normalizeCurrentPracticeItem(
            {
                key: "signed-practice-key",
                exercise: {
                    id: "file-io-q2",
                    kind: "code_input",
                    language: "python",
                },
                workspace: {
                    version: 2,
                    language: "python",
                    entryFileId: "file:main.py",
                    activeFileId: "file:main.py",
                    nodes: [
                        {
                            id: "file:main.py",
                            kind: "file",
                            name: "main.py",
                            parentId: null,
                            content: "# stale shell\n",
                            createdAt: 0,
                            updatedAt: 0,
                        },
                    ],
                    openTabs: ["file:main.py"],
                    expanded: [],
                    stdin: "",
                    leftPct: 40,
                },
                code: "# stale shell\n",
                codeLang: "python",
                codeStdin: "",
                stdin: "",
                userEdited: false,
                workspaceOrigin: "starter",
                single: "",
                multi: [],
                num: "",
                dragA: { x: 0, y: 0, z: 0 },
                dragB: { x: 0, y: 0, z: 0 },
                matRows: 0,
                matCols: 0,
                mat: [],
                result: null,
                submitted: false,
                text: "",
                help: {
                    openedStepKeys: [],
                    activeStepKey: null,
                    entries: {},
                    busyStepKey: null,
                    error: null,
                },
                voiceTranscript: "",
            } as any,
            {
                id: "file-io-q2",
                kind: "code_input",
                language: "python",
                workspace: {
                    language: "python",
                    entryFilePath: "main.py",
                    starterFiles: [
                        {
                            path: "main.py",
                            content: "with open('data/message.txt') as f:\n    print(f.read())\n",
                            isEntry: true,
                        },
                    ],
                    files: [
                        {
                            path: "data/message.txt",
                            content: "hello fixture\n",
                        },
                    ],
                },
            } as any,
            {
                exercise: {
                    workspace: {
                        language: "python",
                        entryFilePath: "main.py",
                        starterFiles: [
                            {
                                path: "main.py",
                                content: "with open('data/message.txt') as f:\n    print(f.read())\n",
                                isEntry: true,
                            },
                        ],
                        files: [
                            {
                                path: "data/message.txt",
                                content: "hello fixture\n",
                            },
                        ],
                    },
                },
            },
        );

        const paths = ((normalized as any).workspace?.nodes ?? [])
            .filter((node: any) => node?.kind === "file")
            .map((node: any) => String(node.name ?? ""));

        expect(paths).toEqual(expect.arrayContaining(["main.py", "message.txt"]));
        expect(deriveEntryCode((normalized as any).workspace)).toContain("data/message.txt");
    });
});
