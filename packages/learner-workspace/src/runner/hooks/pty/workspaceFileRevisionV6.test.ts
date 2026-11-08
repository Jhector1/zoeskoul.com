import { describe, expect, it, vi } from "vitest";
import { WorkspaceFileRevisionV6 } from "./workspaceFileRevisionV6";
import { WorkspaceFileV6Error } from "./workspaceFileClientV6";

const rev = (c: string) => `sha256:${c.repeat(64)}`;

describe("V6B4b session-bound revision coordination", () => {
    it("rejects invalid session identity", () => {
        expect(() => new WorkspaceFileRevisionV6("../other")).toThrow();
    });

    it("never sends a write without a server-acknowledged baseline", async () => {
        const transport = vi.fn();
        const files = new WorkspaceFileRevisionV6("learning-session", transport);
        await expect(files.writeText("main.py", "print(1)")).rejects.toMatchObject({
            code: "REVISION_NOT_LOADED", status: 428,
        });
        expect(transport).not.toHaveBeenCalled();
    });

    it("rejects malformed revisions before any network call", () => {
        const files = new WorkspaceFileRevisionV6("learning-session", vi.fn());
        expect(() => files.acknowledgeRead("main.py", "abc")).toThrow();
    });

    it("rejects path traversal and absolute paths", async () => {
        const transport = vi.fn();
        const files = new WorkspaceFileRevisionV6("learning-session", transport);
        for (const path of ["../other/file", "/etc/passwd", "a//b", "a\\b"]) {
            await expect(files.writeText(path, "x")).rejects.toMatchObject({
                code: "INVALID_PATH",
            });
        }
        expect(transport).not.toHaveBeenCalled();
    });

    it("creates a new text file only with an acknowledged absence", async () => {
        const transport = vi.fn(async () => ({ ok: true as const, revision: rev("a") }));
        const files = new WorkspaceFileRevisionV6("learning-session", transport);
        files.acknowledgeRead("notes.txt", null);
        const next = await files.writeText("notes.txt", "é 😀");
        expect(next).toBe(rev("a"));
        expect(transport).toHaveBeenCalledWith("learning-session", {
            op: "write", path: "notes.txt", expectedRevision: null,
            data: "w6kg8J+YgA==",
        }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(files.stateFor("notes.txt")).toEqual({ state: "known", revision: rev("a") });
    });

    it("serializes same-path writes with the latest acknowledgment", async () => {
        let firstDone!: (result: { ok: true; revision: string }) => void;
        const first = new Promise<{ ok: true; revision: string }>((resolve) => { firstDone = resolve; });
        const transport = vi.fn()
            .mockImplementationOnce(() => first)
            .mockResolvedValueOnce({ ok: true, revision: rev("c") });
        const files = new WorkspaceFileRevisionV6("s", transport);
        files.acknowledgeRead("file.ts", rev("a"));
        const a = files.writeText("file.ts", "first");
        const b = files.writeText("file.ts", "second");
        await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
        firstDone({ ok: true, revision: rev("b") });
        expect(await a).toBe(rev("b"));
        expect(await b).toBe(rev("c"));
        expect(transport.mock.calls[1][1].expectedRevision).toBe(rev("b"));
    });

    it("requires a verified read after an ambiguous network failure", async () => {
        const transport = vi.fn().mockRejectedValueOnce(
            new WorkspaceFileV6Error("NETWORK_UNAVAILABLE", 0),
        ).mockResolvedValueOnce({ ok: true, revision: rev("b") });
        const files = new WorkspaceFileRevisionV6("s", transport);
        files.acknowledgeRead("file.ts", rev("a"));
        await expect(files.writeText("file.ts", "first")).rejects.toMatchObject({
            code: "NETWORK_UNAVAILABLE",
        });
        expect(files.stateFor("file.ts")).toEqual({ state: "needs_read" });
        await expect(files.writeText("file.ts", "automatic retry")).rejects.toMatchObject({
            code: "REVISION_REVALIDATION_REQUIRED",
        });
        files.acknowledgeRead("file.ts", rev("a"));
        await files.writeText("file.ts", "second");
        expect(transport.mock.calls[1][1].expectedRevision).toBe(rev("a"));
    });

    it("blocks all further writes on a CAS conflict until a new verified read", async () => {
        const transport = vi.fn().mockRejectedValueOnce(
            new WorkspaceFileV6Error("CONFLICT", 409),
        ).mockResolvedValueOnce({ ok: true, revision: rev("c") });
        const files = new WorkspaceFileRevisionV6("s", transport);
        files.acknowledgeRead("file.ts", rev("a"));
        await expect(files.writeText("file.ts", "my unsaved code")).rejects.toMatchObject({
            code: "CONFLICT", status: 409,
        });
        expect(files.stateFor("file.ts")).toEqual({ state: "conflict" });
        await expect(files.writeText("file.ts", "retry")).rejects.toMatchObject({
            code: "CONFLICT_REQUIRES_RELOAD",
        });
        expect(transport).toHaveBeenCalledTimes(1);
        files.acknowledgeRead("file.ts", rev("b"));
        await files.writeText("file.ts", "user reconciled content");
        expect(transport.mock.calls[1][1].expectedRevision).toBe(rev("b"));
    });

    it("requires a re-read when server response is malformed after a write", async () => {
        const transport = vi.fn(async () => ({ ok: true as const, revision: undefined }));
        const files = new WorkspaceFileRevisionV6("s", transport);
        files.acknowledgeRead("file.py", rev("a"));
        await expect(files.writeText("file.py", "hello")).rejects.toMatchObject({
            code: "INVALID_REVISION", status: 502,
        });
        expect(files.stateFor("file.py")).toEqual({ state: "needs_read" });
    });

    it("deletes only with the last confirmed revision", async () => {
        const transport = vi.fn(async () => ({ ok: true as const }));
        const files = new WorkspaceFileRevisionV6("s", transport);
        files.acknowledgeRead("file.py", rev("a"));
        await files.deleteFile("file.py");
        expect(transport.mock.calls[0][1]).toEqual({
            op: "delete", path: "file.py", expectedRevision: rev("a"),
        });
        expect(files.stateFor("file.py")).toEqual({ state: "known", revision: null });
    });

    it("cannot import a new baseline while a write is pending", async () => {
        let complete!: (value: { ok: true; revision: string }) => void;
        const transport = vi.fn(() => new Promise<{ ok: true; revision: string }>((resolve) => {
            complete = resolve;
        }));
        const files = new WorkspaceFileRevisionV6("s", transport);
        files.acknowledgeRead("file.py", rev("a"));
        const write = files.writeText("file.py", "pending");
        await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
        expect(() => files.acknowledgeRead("file.py", rev("b"))).toThrow();
        complete({ ok: true, revision: rev("c") });
        await write;
    });

    it("disposal rejects queued mutations and prevents a late reply from updating state", async () => {
        let complete!: (value: { ok: true; revision: string }) => void;
        const transport = vi.fn(() => new Promise<{ ok: true; revision: string }>((resolve) => {
            complete = resolve;
        }));
        const files = new WorkspaceFileRevisionV6("s", transport);
        files.acknowledgeRead("file.py", rev("a"));
        const first = files.writeText("file.py", "first");
        const second = files.writeText("file.py", "second");
        await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
        files.dispose();
        complete({ ok: true, revision: rev("b") });
        await expect(first).rejects.toMatchObject({ code: "SESSION_DISPOSED" });
        await expect(second).rejects.toMatchObject({ code: "SESSION_DISPOSED" });
        expect(transport).toHaveBeenCalledTimes(1);
    });
});
