import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    submitRun: vi.fn(),
    parseRunReq: vi.fn(),
    checkIdeCapability: vi.fn(),
    getActor: vi.fn(),
    ensureGuestId: vi.fn(),
    actorKeyOf: vi.fn(),
    rateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/code/runCode", () => ({
    submitRun: mocks.submitRun,
}));

vi.mock("@/lib/code/api/parseRunReq", () => ({
    parseRunReq: mocks.parseRunReq,
}));

vi.mock("@/lib/access/ideCapabilityServer", () => ({
    checkIdeCapability: mocks.checkIdeCapability,
}));

vi.mock("@/lib/practice/actor", () => ({
    getActor: mocks.getActor,
    ensureGuestId: mocks.ensureGuestId,
    actorKeyOf: mocks.actorKeyOf,
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {},
}));

vi.mock("@/lib/security/ratelimit", () => ({
    rateLimit: mocks.rateLimit,
}));

function makeReq(args?: {
    body?: unknown;
    origin?: string;
    contentLength?: string;
}) {
    const body = JSON.stringify(args?.body ?? {
        language: "python",
        code: "print('hi')",
    });

    const headers: Record<string, string> = {
        "content-type": "application/json",
        origin: args?.origin ?? "https://app.test",
    };

    if (args?.contentLength) {
        headers["content-length"] = args.contentLength;
    }

    return new Request("https://app.test/api/run/judge0", {
        method: "POST",
        headers,
        body,
    });
}

describe("POST /api/run/judge0", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("APP_ORIGIN", "https://app.test");

        mocks.getActor.mockResolvedValue({
            userId: "user-1",
            guestId: null,
        });

        mocks.ensureGuestId.mockImplementation((actor) => ({
            actor,
            setGuestId: null,
        }));

        mocks.actorKeyOf.mockReturnValue("u:user-1");

        mocks.rateLimit.mockResolvedValue({
            ok: true,
            limit: 40,
            remaining: 39,
            resetMs: Date.now() + 60_000,
        });

        mocks.checkIdeCapability.mockResolvedValue({
            ok: true,
        });

        mocks.parseRunReq.mockReturnValue({
            kind: "code",
            language: "python",
            code: "print('hi')",
            limits: {
                enable_network: true,
            },
        });

        mocks.submitRun.mockResolvedValue({
            ok: true,
            mode: "queued",
            token: "token-123",
        });
    });

    it("rejects cross-origin POST requests before parsing JSON", async () => {
        const { POST } = await import("./route");

        const req = makeReq({
            origin: "https://evil.test",
        });

        const jsonSpy = vi.spyOn(req, "json");

        const res = await POST(req);

        expect(res.status).toBe(403);
        expect(jsonSpy).not.toHaveBeenCalled();
        expect(mocks.getActor).not.toHaveBeenCalled();
        expect(mocks.rateLimit).not.toHaveBeenCalled();
        expect(mocks.parseRunReq).not.toHaveBeenCalled();
        expect(mocks.submitRun).not.toHaveBeenCalled();
    });

    it("rejects oversized requests before parsing JSON or rate limiting", async () => {
        const { POST } = await import("./route");

        const req = makeReq({
            contentLength: String(2 * 1024 * 1024 + 1),
        });

        const jsonSpy = vi.spyOn(req, "json");

        const res = await POST(req);

        expect(res.status).toBe(413);
        expect(jsonSpy).not.toHaveBeenCalled();
        expect(mocks.getActor).not.toHaveBeenCalled();
        expect(mocks.rateLimit).not.toHaveBeenCalled();
        expect(mocks.parseRunReq).not.toHaveBeenCalled();
        expect(mocks.submitRun).not.toHaveBeenCalled();
    });

    it("rate-limits before parsing JSON", async () => {
        const { POST } = await import("./route");

        mocks.rateLimit.mockResolvedValueOnce({
            ok: false,
            limit: 40,
            remaining: 0,
            resetMs: Date.now() + 30_000,
        });

        const req = makeReq();
        const jsonSpy = vi.spyOn(req, "json");

        const res = await POST(req);

        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBeTruthy();
        expect(mocks.getActor).toHaveBeenCalled();
        expect(mocks.rateLimit).toHaveBeenCalledWith("run:u:user-1", {
            bucket: "code-execution",
            limit: 40,
            window: "60 s",
        });
        expect(jsonSpy).not.toHaveBeenCalled();
        expect(mocks.parseRunReq).not.toHaveBeenCalled();
        expect(mocks.submitRun).not.toHaveBeenCalled();
    });

    it("forces enable_network false before submitting code runs", async () => {
        const { POST } = await import("./route");

        const res = await POST(makeReq({
            body: {
                language: "python",
                code: "print('hi')",
                limits: {
                    enable_network: true,
                },
            },
        }));

        expect(res.status).toBe(200);

        expect(mocks.submitRun).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "code",
                language: "python",
                code: "print('hi')",
                limits: expect.objectContaining({
                    enable_network: false,
                }),
            }),
        );
    });

    it("does not require multi-file capability for a single-file run", async () => {
        const { POST } = await import("./route");

        mocks.parseRunReq.mockReturnValueOnce({
            kind: "code",
            language: "python",
            code: "print('single')",
            limits: {},
        });

        const res = await POST(makeReq());

        expect(res.status).toBe(200);
        expect(mocks.checkIdeCapability).not.toHaveBeenCalled();
    });

    it("requires multi-file capability for multi-file runs", async () => {
        const { POST } = await import("./route");

        mocks.parseRunReq.mockReturnValueOnce({
            kind: "code",
            language: "python",
            entry: "main.py",
            files: [
                { path: "main.py", content: "print('main')" },
                { path: "helper.py", content: "def helper(): return 42" },
            ],
            limits: {},
        });

        const res = await POST(makeReq());

        expect(res.status).toBe(200);
        expect(mocks.checkIdeCapability).toHaveBeenCalledWith(expect.anything(), {
            actor: {
                userId: "user-1",
                guestId: null,
            },
            capability: "multi_file",
        });
    });

    it("blocks multi-file runs when the actor lacks capability", async () => {
        const { POST } = await import("./route");

        mocks.parseRunReq.mockReturnValueOnce({
            kind: "code",
            language: "python",
            entry: "main.py",
            files: [
                { path: "main.py", content: "print('main')" },
                { path: "helper.py", content: "def helper(): return 42" },
            ],
            limits: {},
        });

        mocks.checkIdeCapability.mockResolvedValueOnce({
            ok: false,
            reason: "plan_limit",
        });

        const res = await POST(makeReq());

        expect(res.status).toBe(403);
        expect(mocks.submitRun).not.toHaveBeenCalled();
    });
});