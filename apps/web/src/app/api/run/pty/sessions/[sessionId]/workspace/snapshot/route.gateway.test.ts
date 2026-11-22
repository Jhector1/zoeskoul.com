import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireRunnerActorKey: vi.fn(),
    runnerPost: vi.fn(),
    forgetPtyLeaseBySession: vi.fn(),
}));

vi.mock("@/lib/server/runnerActorKey", () => ({
    requireRunnerActorKey: mocks.requireRunnerActorKey,
}));
vi.mock("@/lib/server/runnerClient", () => ({
    runnerPost: mocks.runnerPost,
    RunnerHttpError: class RunnerHttpError extends Error {
        constructor(public readonly status: number, message: string) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/ptySessionLeases", () => ({
    forgetPtyLeaseBySession: mocks.forgetPtyLeaseBySession,
}));

import { POST } from "./route";
import { RunnerHttpError } from "@/lib/server/runnerClient";

const params = (sessionId = "session-learner-1") => ({ params: Promise.resolve({ sessionId }) });
const request = () => new Request("http://localhost/api/run/pty/sessions/session-learner-1/workspace/snapshot", { method: "POST" });

beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRunnerActorKey.mockResolvedValue("u:learner-authorized");
    mocks.forgetPtyLeaseBySession.mockResolvedValue(undefined);
});

describe("web snapshot gateway: authenticated actor, response integrity, no cache", () => {
    it("forwards the authorized actor to the canonical Runner endpoint without losing directories or binary files", async () => {
        const files = [
            { kind: "directory", path: "private" },
            { kind: "file", path: "private/note.txt", content: "private content" },
            { kind: "file", path: "picture.png", encoding: "base64", data: "AQID", mimeType: "image/png", sizeBytes: 3 },
        ];
        mocks.runnerPost.mockResolvedValueOnce({ ok: true, files });
        const res = await POST(request(), params());
        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(await res.json()).toEqual({ ok: true, files });
        expect(mocks.runnerPost).toHaveBeenCalledTimes(1);
        expect(mocks.runnerPost).toHaveBeenCalledWith(
            "/sessions/session-learner-1/snapshot-workspace", "u:learner-authorized", {},
        );
        expect(mocks.forgetPtyLeaseBySession).not.toHaveBeenCalled();
    });

    it("does not contact Runner when web authentication fails", async () => {
        mocks.requireRunnerActorKey.mockRejectedValueOnce(new Error("Unauthorized"));
        const res = await POST(request(), params());
        // This existing route currently maps non-Runner errors to 400, including Unauthorized.
        // Record that behavior; changing it to 401 is a separate production decision.
        expect(res.status).toBe(400);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect((await res.json()).ok).toBe(false);
        expect(mocks.runnerPost).not.toHaveBeenCalled();
    });

    it("preserves Runner cross-actor denial and invalidates only the actor's stale lease", async () => {
        mocks.runnerPost.mockRejectedValueOnce(new RunnerHttpError(403, "Forbidden"));
        const res = await POST(request(), params());
        expect(res.status).toBe(403);
        expect((await res.json()).ok).toBe(false);
        expect(mocks.forgetPtyLeaseBySession).toHaveBeenCalledWith({
            actorKey: "u:learner-authorized", sessionId: "session-learner-1",
        });
    });

    it("preserves Runner 404 for expired sessions and forgets only the caller's lease", async () => {
        mocks.runnerPost.mockRejectedValueOnce(new RunnerHttpError(404, "Session not found"));
        const res = await POST(request(), params());
        expect(res.status).toBe(404);
        expect(mocks.forgetPtyLeaseBySession).toHaveBeenCalledTimes(1);
    });

    it("preserves restricted snapshot 409 without falsely dropping a live lease", async () => {
        mocks.runnerPost.mockRejectedValueOnce(new RunnerHttpError(409, "Restricted workspace"));
        const res = await POST(request(), params());
        expect(res.status).toBe(409);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(mocks.forgetPtyLeaseBySession).not.toHaveBeenCalled();
    });

    it("rejects a non-ok Runner payload without reporting snapshot success", async () => {
        mocks.runnerPost.mockResolvedValueOnce({ ok: false, error: "Worker unavailable" });
        const res = await POST(request(), params());
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ ok: false, error: "Worker unavailable" });
        expect(mocks.forgetPtyLeaseBySession).not.toHaveBeenCalled();
    });

    it("preserves Runner 500 without treating it as a stale session", async () => {
        mocks.runnerPost.mockRejectedValueOnce(new RunnerHttpError(500, "Internal Runner failure"));
        const res = await POST(request(), params());
        expect(res.status).toBe(500);
        expect(mocks.forgetPtyLeaseBySession).not.toHaveBeenCalled();
    });

    it("URL-encodes the session ID rather than injecting a second Runner path", async () => {
        mocks.runnerPost.mockResolvedValueOnce({ ok: true, files: [] });
        const res = await POST(request(), params("sess/x?e=1"));
        expect(res.status).toBe(200);
        expect(mocks.runnerPost).toHaveBeenCalledWith(
            "/sessions/sess%2Fx%3Fe%3D1/snapshot-workspace", "u:learner-authorized", {},
        );
    });
});
