import { describe, expect, it, vi } from "vitest";
import {
    fetchResolvedPracticeItem,
    normalizeCurrentPracticeItem,
} from "@/lib/practice/runtime/client";
import { deriveEntryCode } from "@/components/review/module/runtime/exerciseWorkspaceResolver";

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
                starterCode: "@:quiz.m1_s04_query_one_column_name.starterCode",
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

        expect((loaded.exercise as Extract<typeof loaded.exercise, { kind: "code_input" }>).starterCode).toBe("-- Return only product names\n");
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
                language: "python",
                starterCode: "print('starter')\n",
            } as any,
            {
                language: "sql",
                starterCode: "-- live sql starter\n",
                starterFiles: [{ path: "query.sql", content: "-- live sql starter\n" }],
                workspace: {
                    version: 2,
                    language: "sql",
                    entryFileId: "query.sql",
                    activeFileId: "query.sql",
                    nodes: [],
                    openTabs: [],
                    expanded: [],
                    stdin: "",
                },
                recipe: {
                    starterCode: "-- recipe sql starter\n",
                },
            },
        );

        expect((normalized.exercise as any).language).toBe("sql");
        expect((normalized.exercise as any).starterCode).toBe("-- live sql starter\n");
        expect((normalized.exercise as any).starterFiles).toEqual([
            { path: "query.sql", content: "-- live sql starter\n" },
        ]);
        expect((normalized.exercise as any).recipe).toEqual({
            starterCode: "-- recipe sql starter\n",
        });
        expect((normalized as any).workspace?.language).toBe("sql");
        expect((normalized as any).code).toBe("-- live sql starter\n");
    });

    it("hydrates starter-backed runtime workspace snapshots for live multi-file practice items", () => {
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
                id: "file-io-q1",
                kind: "code_input",
                language: "python",
            } as any,
            {
                language: "python",
                starterFiles: [
                    { path: "main.py", content: "with open('data.txt') as f:\n    print(f.read())\n" },
                ],
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
                            content: "with open('data.txt') as f:\n    print(f.read())\n",
                            createdAt: 0,
                            updatedAt: 0,
                        },
                        {
                            id: "file:data.txt",
                            kind: "file",
                            name: "data.txt",
                            parentId: null,
                            content: "fixture line\n",
                            createdAt: 0,
                            updatedAt: 0,
                        },
                    ],
                    openTabs: ["file:main.py"],
                    expanded: [],
                    stdin: "",
                    leftPct: 40,
                },
            },
        );

        const paths = ((normalized as any).workspace?.nodes ?? [])
            .filter((node: any) => node?.kind === "file")
            .map((node: any) => String(node.name ?? ""));

        expect(paths).toEqual(expect.arrayContaining(["main.py", "data.txt"]));
        expect(deriveEntryCode((normalized as any).workspace)).toContain("with open('data.txt')");
    });
});
