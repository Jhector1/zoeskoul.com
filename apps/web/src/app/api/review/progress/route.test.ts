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
});
