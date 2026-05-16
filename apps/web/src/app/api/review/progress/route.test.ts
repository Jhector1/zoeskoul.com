import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
    row: null as null | { id: string; updatedAt: Date; state: any },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        reviewProgress: {
            findUnique: vi.fn(async () => mockDb.row),
            upsert: vi.fn(async ({ create, update }: any) => {
                const state = mockDb.row ? update.state : create.state;
                mockDb.row = {
                    id: "review-progress-1",
                    updatedAt: new Date("2026-05-07T12:00:00.000Z"),
                    state,
                };
                return mockDb.row;
            }),
        },
        reviewQuizInstance: {
            deleteMany: vi.fn(async () => ({ count: 0 })),
        },
        $transaction: vi.fn(async (steps: any[]) => Promise.all(steps)),
    },
}));

vi.mock("@/lib/practice/actor", () => ({
    getActor: vi.fn(async () => ({ userId: "user-1", guestId: null })),
    ensureGuestId: vi.fn((actor: any) => ({ actor })),
    actorKeyOf: vi.fn(() => "u:test-user"),
    attachGuestCookie: vi.fn((res: Response) => res),
}));

vi.mock("@/lib/review/api/shared/modules", () => ({
    resolveReviewModuleForSubject: vi.fn(async () => ({
        ok: true,
        module: { slug: "sql_module_12" },
    })),
}));

vi.mock("@/lib/gamification/awardReviewProgressGamification", () => ({
    awardReviewProgressGamification: vi.fn(async () => null),
}));

vi.mock("@/lib/security/ratelimit", () => ({
    rateLimit: vi.fn(async () => ({
        ok: true,
        limit: 180,
        remaining: 179,
        resetMs: Date.now() + 60_000,
    })),
}));

describe("/api/review/progress route", () => {
    beforeEach(() => {
        mockDb.row = null;
        vi.resetModules();
    });

    it("saves and restores a multi-file exercise workspace through PUT then GET", async () => {
        const route = await import("./route");

        const workspace = {
            version: 2,
            language: "python",
            nodes: [
                {
                    id: "src",
                    kind: "folder",
                    name: "src",
                    parentId: null,
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "src/main.py",
                    kind: "file",
                    name: "main.py",
                    parentId: "src",
                    content: "print('main file')\n",
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "src/helper.py",
                    kind: "file",
                    name: "helper.py",
                    parentId: "src",
                    content: "def helper():\n    return 42\n",
                    createdAt: 1,
                    updatedAt: 1,
                },
            ],
            openTabs: ["src/main.py", "src/helper.py"],
            activeFileId: "src/helper.py",
            entryFileId: "src/main.py",
            stdin: "9\n",
            expanded: ["src"],
            leftPct: 38,
        };

        const putReq = new Request("http://localhost:3000/api/review/progress", {
            method: "PUT",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectSlug: "sql",
                moduleSlug: "sql_module_12",
                locale: "en",
                state: {
                    activeTopicId: "what-update-does",
                    topics: {
                        "section_12_1.what-update-does": {
                            runtimeStateV2: {
                                exercises: {
                                    "sql:sql_module_12:section_12_1:what-update-does:q1": {
                                        language: "python",
                                        lang: "python",
                                        workspace,
                                        codeWorkspace: workspace,
                                        ideWorkspace: workspace,
                                        stdin: "9\n",
                                        codeStdin: "9\n",
                                        code: "print('main file')\n",
                                        source: "print('main file')\n",
                                        userEdited: true,
                                        workspaceOrigin: "user",
                                        updatedAt: 123,
                                    },
                                },
                            },
                            quizState: {
                                q1: {
                                    answers: {},
                                    checkedById: {},
                                    practiceItemPatch: {
                                        "sql:sql_module_12:section_12_1:what-update-does:q1": {
                                            workspace,
                                            codeWorkspace: workspace,
                                            ideWorkspace: workspace,
                                            stdin: "9\n",
                                            codeStdin: "9\n",
                                            code: "print('main file')\n",
                                            source: "print('main file')\n",
                                            language: "python",
                                            lang: "python",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
        });

        const putRes = await route.PUT(putReq);
        expect(putRes.status).toBe(200);

        const putJson = await putRes.json();
        const savedExercise =
            putJson.state.topics["what-update-does"].runtimeStateV2.exercises[
                "sql:sql_module_12:section_12_1:what-update-does:q1"
            ];

        expect(savedExercise.workspace).toEqual(workspace);
        expect(savedExercise.codeWorkspace).toEqual(workspace);
        expect(savedExercise.ideWorkspace).toEqual(workspace);

        const getReq = new Request(
            "http://localhost:3000/api/review/progress?subjectSlug=sql&moduleSlug=sql_module_12&locale=en",
            { method: "GET" },
        );

        const getRes = await route.GET(getReq);
        expect(getRes.status).toBe(200);

        const getJson = await getRes.json();
        const restoredExercise =
            getJson.progress.topics["what-update-does"].runtimeStateV2.exercises[
                "sql:sql_module_12:section_12_1:what-update-does:q1"
            ];

        expect(restoredExercise.workspace).toEqual(workspace);
        expect(restoredExercise.codeWorkspace).toEqual(workspace);
        expect(restoredExercise.ideWorkspace).toEqual(workspace);
        expect(restoredExercise.stdin).toBe("9\n");
        expect(restoredExercise.codeStdin).toBe("9\n");
        expect(restoredExercise.workspace.activeFileId).toBe("src/helper.py");
        expect(restoredExercise.workspace.entryFileId).toBe("src/main.py");
        expect(restoredExercise.workspace.openTabs).toEqual(["src/main.py", "src/helper.py"]);
    });


    it("reset module save clears previous completed topics instead of merging them back", async () => {
        const route = await import("./route");

        mockDb.row = {
            id: "review-progress-1",
            updatedAt: new Date("2026-05-07T12:00:00.000Z"),
            state: {
                quizVersion: 1,
                moduleCompleted: true,
                moduleCompletedAt: "2026-05-07T12:00:00.000Z",
                activeTopicId: "topic-a",
                topics: {
                    "topic-a": {
                        completed: true,
                        completedAt: "2026-05-07T12:00:00.000Z",
                        readingDone: { "read-a": true },
                        cardsDone: { "read-a": true },
                        quizzesDone: { "quiz-a": true },
                        quizState: {
                            "quiz-a": {
                                answers: {},
                                checkedById: {},
                            },
                        },
                    },
                },
                __saveRevision: 10,
            },
        };

        const putReq = new Request("http://localhost:3000/api/review/progress", {
            method: "PUT",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectSlug: "sql",
                moduleSlug: "sql_module_12",
                locale: "en",
                state: {
                    quizVersion: 2,
                    moduleCompleted: false,
                    moduleCompletedAt: undefined,
                    activeTopicId: "topic-a",
                    topics: {},
                    __saveRevision: 11,
                },
            }),
        });

        const putRes = await route.PUT(putReq);

        expect(putRes.status).toBe(200);

        const json = await putRes.json();

        expect(json.state.moduleCompleted).toBe(false);
        expect(json.state.moduleCompletedAt).toBeUndefined();
        expect(json.state.topics).toEqual({});
        expect(json.state.quizVersion).toBe(2);
    });

    it("reset topic save clears only that topic and preserves other completed topics", async () => {
        const route = await import("./route");

        mockDb.row = {
            id: "review-progress-1",
            updatedAt: new Date("2026-05-07T12:00:00.000Z"),
            state: {
                quizVersion: 1,
                moduleCompleted: true,
                moduleCompletedAt: "2026-05-07T12:00:00.000Z",
                activeTopicId: "topic-a",
                topics: {
                    "topic-a": {
                        quizVersion: 1,
                        completed: true,
                        completedAt: "2026-05-07T12:00:00.000Z",
                        readingDone: { "read-a": true },
                        cardsDone: { "read-a": true },
                        quizzesDone: { "quiz-a": true },
                        quizState: {
                            "quiz-a": {
                                answers: {},
                                checkedById: {},
                            },
                        },
                    },
                    "topic-b": {
                        quizVersion: 1,
                        completed: true,
                        completedAt: "2026-05-07T12:01:00.000Z",
                        readingDone: { "read-b": true },
                        cardsDone: { "read-b": true },
                        quizzesDone: { "quiz-b": true },
                        quizState: {
                            "quiz-b": {
                                answers: {},
                                checkedById: {},
                            },
                        },
                    },
                },
                __saveRevision: 10,
            },
        };

        const putReq = new Request("http://localhost:3000/api/review/progress", {
            method: "PUT",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectSlug: "sql",
                moduleSlug: "sql_module_12",
                locale: "en",
                state: {
                    quizVersion: 1,
                    moduleCompleted: false,
                    moduleCompletedAt: undefined,
                    activeTopicId: "topic-a",
                    topics: {
                        "topic-a": {
                            quizVersion: 2,
                            completed: false,
                            completedAt: undefined,
                            readingDone: {},
                            cardsDone: {},
                            quizzesDone: {},
                            quizState: {},
                            sketchState: {},
                            toolState: {},
                            runtimeStateV2: {
                                cards: {},
                                exercises: {},
                            },
                        },
                    },
                    __saveRevision: 11,
                },
            }),
        });

        const putRes = await route.PUT(putReq);

        expect(putRes.status).toBe(200);

        const json = await putRes.json();

        expect(json.state.moduleCompleted).toBe(false);
        expect(json.state.moduleCompletedAt).toBeUndefined();

        expect(json.state.topics["topic-a"].completed).toBe(false);
        expect(json.state.topics["topic-a"].completedAt).toBeUndefined();
        expect(json.state.topics["topic-a"].readingDone).toEqual({});
        expect(json.state.topics["topic-a"].cardsDone).toEqual({});
        expect(json.state.topics["topic-a"].quizzesDone).toEqual({});
        expect(json.state.topics["topic-a"].quizState).toEqual({});

        expect(json.state.topics["topic-b"].completed).toBe(true);
        expect(json.state.topics["topic-b"].readingDone).toEqual({
            "read-b": true,
        });
        expect(json.state.topics["topic-b"].quizzesDone).toEqual({
            "quiz-b": true,
        });
    });

    it("reset quiz save removes only that quiz without resurrecting old quiz completion", async () => {
        const route = await import("./route");

        mockDb.row = {
            id: "review-progress-1",
            updatedAt: new Date("2026-05-07T12:00:00.000Z"),
            state: {
                quizVersion: 1,
                moduleCompleted: true,
                moduleCompletedAt: "2026-05-07T12:00:00.000Z",
                activeTopicId: "topic-a",
                topics: {
                    "topic-a": {
                        quizVersion: 1,
                        completed: true,
                        completedAt: "2026-05-07T12:00:00.000Z",
                        readingDone: { "read-a": true },
                        cardsDone: { "read-a": true },
                        quizzesDone: {
                            "quiz-a": true,
                            "quiz-b": true,
                        },
                        quizState: {
                            "quiz-a": {
                                answers: { q1: "remove" },
                                checkedById: {},
                            },
                            "quiz-b": {
                                answers: { q2: "keep" },
                                checkedById: {},
                            },
                        },
                    },
                },
                __saveRevision: 10,
            },
        };

        const putReq = new Request("http://localhost:3000/api/review/progress", {
            method: "PUT",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectSlug: "sql",
                moduleSlug: "sql_module_12",
                locale: "en",
                state: {
                    quizVersion: 1,
                    moduleCompleted: false,
                    moduleCompletedAt: undefined,
                    activeTopicId: "topic-a",
                    topics: {
                        "topic-a": {
                            quizVersion: 2,
                            completed: false,
                            completedAt: undefined,
                            readingDone: { "read-a": true },
                            cardsDone: { "read-a": true },
                            quizzesDone: {
                                "quiz-b": true,
                            },
                            quizState: {
                                "quiz-b": {
                                    answers: { q2: "keep" },
                                    checkedById: {},
                                },
                            },
                        },
                    },
                    __saveRevision: 11,
                },
            }),
        });

        const putRes = await route.PUT(putReq);

        expect(putRes.status).toBe(200);

        const json = await putRes.json();
        const topic = json.state.topics["topic-a"];

        expect(topic.completed).toBe(false);
        expect(topic.quizzesDone["quiz-a"]).toBeUndefined();
        expect(topic.quizState["quiz-a"]).toBeUndefined();

        expect(topic.quizzesDone["quiz-b"]).toBe(true);
        expect(topic.quizState["quiz-b"].answers).toEqual({
            q2: "keep",
        });
    });
});
