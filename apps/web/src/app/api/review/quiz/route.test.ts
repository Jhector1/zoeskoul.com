import type { Actor } from "@/lib/practice/actor";
import {
    ReviewQuizSpecSchema,
} from "@/lib/review/api/quiz/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ReviewQuizQuestion = {
    kind: "practice";
    id: string;
    fetch: {
        topic?: string;
        preferPurpose?: "quiz" | "project" | "mixed";
        preferKind?: string | null;
        exerciseKey?: string;
        seedPolicy?: "actor" | "global";
        salt?: string;
    };
};

type StoredQuizRow = {
    questions: ReviewQuizQuestion[];
};

type ReviewQuizInstanceFindUniqueArgs = {
    where: {
        actorKey_quizKey: {
            actorKey: string;
            quizKey: string;
        };
    };
};

type ReviewQuizInstanceCreateArgs = {
    data: {
        actorKey: string;
        quizKey: string;
        questions: ReviewQuizQuestion[];
    };
};

type ReviewQuizInstanceDeleteManyArgs = {
    where: {
        actorKey: string;
        quizKey: string;
    };
};

const mockDb = vi.hoisted(() => ({
    quizRows: new Map<string, StoredQuizRow>(),
    practiceTopicFindMany: vi.fn(async () => []),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        reviewQuizInstance: {
            findUnique: vi.fn(async ({ where }: ReviewQuizInstanceFindUniqueArgs) => {
                const key = `${where.actorKey_quizKey.actorKey}|${where.actorKey_quizKey.quizKey}`;
                const row = mockDb.quizRows.get(key);
                return row ? { questions: row.questions } : null;
            }),
            create: vi.fn(async ({ data }: ReviewQuizInstanceCreateArgs) => {
                const key = `${data.actorKey}|${data.quizKey}`;
                mockDb.quizRows.set(key, { questions: data.questions });
                return { id: "review-quiz-1", ...data };
            }),
            deleteMany: vi.fn(async ({ where }: ReviewQuizInstanceDeleteManyArgs) => {
                const key = `${where.actorKey}|${where.quizKey}`;
                const existed = mockDb.quizRows.delete(key);
                return { count: existed ? 1 : 0 };
            }),
        },
        practiceTopic: {
            findMany: mockDb.practiceTopicFindMany,
        },
    },
}));

vi.mock("@/lib/practice/actor", () => ({
    getActor: vi.fn(async () => ({ userId: "user-1", guestId: null })),
    ensureGuestId: vi.fn((actor: Actor) => ({ actor, setGuestId: null })),
    actorKeyOf: vi.fn(() => "u:test-user"),
    attachGuestCookie: vi.fn((res: Response) => res),
}));

vi.mock("@/lib/practice/catalog", () => ({
    rngFromActor: vi.fn(() => ({
        int: (min: number) => min,
    })),
}));

vi.mock("@/lib/review/api/access/resolveReviewAccess", () => ({
    parseReviewQuizKey: vi.fn((quizKey: string) => {
        const parts = quizKey.split("|");
        return {
            subjectSlug: parts.find((part) => part.startsWith("subject="))?.slice(8) ?? null,
            moduleSlug: parts.find((part) => part.startsWith("module="))?.slice(7) ?? null,
        };
    }),
    resolveReviewAccess: vi.fn(async () => ({
        ok: true,
        mode: "standard",
        bypassBilling: false,
        scope: {
            subjectSlug: "sql",
            moduleSlug: "sql-module-1",
            subjectDbId: "subject-1",
            moduleDbId: "module-1",
        },
    })),
}));

vi.mock("@/lib/subjects/registry", () => ({
    hasReviewModule: vi.fn(() => true),
}));

vi.mock("@/serverUtils", () => ({
    getLocaleFromCookie: vi.fn(async () => "en"),
}));

vi.mock("@/lib/subjects", () => ({
    SECTIONS: [],
    TOPICS: [
        {
            slug: "sql.quiz-topic",
            subjectSlug: "sql",
            moduleSlug: "sql-module-1",
            genKey: "quiz-topic",
            meta: {
                pool: [
                    { key: "quiz-single", w: 1, kind: "single_choice", purpose: "quiz" },
                    { key: "quiz-drag", w: 1, kind: "drag_reorder", purpose: "quiz" },
                    { key: "project-code", w: 1, kind: "code_input", purpose: "project" },
                    { key: "quiz-code", w: 1, kind: "code_input", purpose: "quiz" },
                ],
            },
        },
    ],
}));

describe("/api/review/quiz route", () => {
    beforeEach(() => {
        mockDb.quizRows.clear();
        mockDb.practiceTopicFindMany.mockClear();
        vi.resetModules();
    });

    it("generates quiz-mode questions from quiz-purpose pool items only", async () => {
        const route = await import("./route");

        const req = new Request("http://localhost:3000/api/review/quiz", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                subject: "sql",
                moduleSlug: "sql-module-1",
                topic: "sql.quiz-topic",
                n: 1,
                mode: "quiz",
                preferKind: null,
            }),
        });

        const res = await route.POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.quizKey).toContain("selection=purpose-v3");
        expect(json.questions).toHaveLength(1);
        expect(json.questions[0].fetch.preferPurpose).toBe("quiz");
        expect(json.questions[0].fetch.exerciseKey).toBe("quiz-single");
        expect(json.questions[0].fetch.exerciseKey).not.toBe("project-code");
        expect(mockDb.practiceTopicFindMany).not.toHaveBeenCalled();
    });

    it("returns project-mode practice steps with project purpose and code_input kind", async () => {
        const route = await import("./route");

        const req = new Request("http://localhost:3000/api/review/quiz", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                subject: "sql",
                moduleSlug: "sql-module-1",
                mode: "project",
                steps: [
                    {
                        id: "step-1",
                        topic: "sql.quiz-topic",
                        preferKind: "code_input",
                    },
                ],
            }),
        });

        const res = await route.POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.quizKey).toContain("selection=purpose-v3");
        expect(json.questions).toHaveLength(1);
        expect(json.questions[0].fetch.preferPurpose).toBe("project");
        expect(json.questions[0].fetch.preferKind).toBe("code_input");
    });

    it("returns a one-step try-it style project request through the normal project/code_input flow", async () => {
        const route = await import("./route");

        const req = new Request("http://localhost:3000/api/review/quiz", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                subject: "sql",
                moduleSlug: "sql-module-1",
                mode: "project",
                steps: [
                    {
                        id: "try_filter_one_table",
                        topic: "sql.quiz-topic",
                        preferKind: "code_input",
                        exerciseKey: "project-code",
                        seedPolicy: "global",
                        maxAttempts: null,
                    },
                ],
            }),
        });

        const res = await route.POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.requested).toBe(1);
        expect(json.generated).toBe(1);
        expect(json.questions).toHaveLength(1);
        expect(json.questions[0].fetch.preferPurpose).toBe("project");
        expect(json.questions[0].fetch.preferKind).toBe("code_input");
        expect(json.questions[0].fetch.exerciseKey).toBe("project-code");
        expect(json.questions[0].fetch.seedPolicy).toBe("global");
    });

    it("discards a stale frozen project instance when its stored step topic no longer matches the spec", async () => {
        const route = await import("./route");
        const { buildReviewQuizKey } = await import("@/lib/review/api/quiz/keys");

        const spec = ReviewQuizSpecSchema.parse({
            subject: "sql",
            moduleSlug: "sql-module-1",
            mode: "project" as const,
            steps: [
                {
                    id: "step-1",
                    topic: "sql.quiz-topic",
                    preferKind: "code_input",
                },
            ],
        });

        const quizKey = buildReviewQuizKey(spec);
        mockDb.quizRows.set(`u:test-user|${quizKey}`, {
            questions: [
                {
                    kind: "practice",
                    id: "stale-step-1",
                    fetch: {
                        topic: "sql.wrong-topic",
                        preferPurpose: "project",
                        preferKind: "code_input",
                        exerciseKey: "project-code",
                        salt: `${quizKey}|step=step-1|slot=1`,
                    },
                },
            ],
        });

        const req = new Request("http://localhost:3000/api/review/quiz", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(spec),
        });

        const res = await route.POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.questions).toHaveLength(1);
        expect(json.questions[0].fetch.topic).toBe("sql.quiz-topic");
        expect(json.questions[0].fetch.preferPurpose).toBe("project");
        expect(mockDb.quizRows.get(`u:test-user|${quizKey}`)?.questions[0]?.fetch.topic).toBe("sql.quiz-topic");
    });

    it("ignores stale purpose-v2 frozen rows and regenerates with purpose-v3", async () => {
        const route = await import("./route");
        const { buildReviewQuizKey } = await import("@/lib/review/api/quiz/keys");

        // If code_input appears in a normal quiz after this change, first check
        // for stale reviewQuizInstance rows or an outdated manifest build. Reset
        // the quiz/topic and regenerate manifests before digging deeper.
        const spec = ReviewQuizSpecSchema.parse({
            subject: "sql",
            moduleSlug: "sql-module-1",
            topic: "sql.quiz-topic",
            n: 1,
            mode: "quiz" as const,
            preferKind: null,
        });

        const v3Key = buildReviewQuizKey(spec);
        const v2Key = v3Key.replace("selection=purpose-v3", "selection=purpose-v2");

        mockDb.quizRows.set(`u:test-user|${v2Key}`, {
            questions: [
                {
                    kind: "practice",
                    id: "stale-q1",
                    fetch: {
                        topic: "sql.quiz-topic",
                        preferPurpose: "mixed",
                        exerciseKey: "project-code",
                    },
                },
            ],
        });

        const req = new Request("http://localhost:3000/api/review/quiz", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(spec),
        });

        const res = await route.POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.quizKey).toBe(v3Key);
        expect(json.questions[0].fetch.exerciseKey).toBe("quiz-single");
        expect(json.questions[0].fetch.exerciseKey).not.toBe("project-code");
    });

    it("returns an existing matching frozen purpose-v3 quiz instance before regenerating", async () => {
        const route = await import("./route");
        const { buildReviewQuizKey } = await import("@/lib/review/api/quiz/keys");

        const spec = ReviewQuizSpecSchema.parse({
            subject: "sql",
            moduleSlug: "sql-module-1",
            topic: "sql.quiz-topic",
            n: 1,
            mode: "quiz" as const,
            preferKind: null,
        });

        const quizKey = buildReviewQuizKey(spec);
        mockDb.quizRows.set(`u:test-user|${quizKey}`, {
            questions: [
                {
                    kind: "practice",
                    id: "frozen-q1",
                    fetch: {
                        topic: "sql.quiz-topic",
                        preferPurpose: "quiz",
                        exerciseKey: "quiz-drag",
                    },
                },
            ],
        });

        const req = new Request("http://localhost:3000/api/review/quiz", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(spec),
        });

        const res = await route.POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.frozen).toBe(true);
        expect(json.quizKey).toBe(quizKey);
        expect(json.questions[0].fetch.exerciseKey).toBe("quiz-drag");
    });
});
