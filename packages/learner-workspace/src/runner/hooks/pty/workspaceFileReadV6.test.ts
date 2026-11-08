import { describe, expect, it, vi } from "vitest";
import { WorkspaceFileRevisionV6 } from "./workspaceFileRevisionV6";
import { WorkspaceFileV6Error } from "./workspaceFileClientV6";
import { decodeWorkspaceFileV6Directory, decodeWorkspaceFileV6TextRead } from "./workspaceFileReadV6";

const REV = `sha256:${"a".repeat(64)}`;
const read = (text: string) => ({
    ok: true as const, revision: REV, mode: 0o644,
    data: btoa(String.fromCharCode(...new TextEncoder().encode(text))),
});

describe("V6B4c Python worker read contract and revision safety", () => {
    it("decodes worker's base64 Unicode and actual mode/revision envelope", () => {
        expect(decodeWorkspaceFileV6TextRead(read("Bonjou 🌴 — 世界\n"))).toEqual({
            exists: true, revision: REV, mode: 0o644, content: "Bonjou 🌴 — 世界\n",
        });
    });

    it("rejects malformed revision, data, mode and response", () => {
        for (const reply of [
            { ...read("x"), revision: "old" },
            { ...read("x"), data: "%%%" },
            { ...read("x"), mode: -1 },
            { ...read("x"), mode: 1024 },
            { ok: true as const, content: "not the worker contract" },
            { ...read("x"), data: "".padEnd(7_000_000, "a") },
        ]) {
            expect(() => decodeWorkspaceFileV6TextRead(reply)).toThrow(WorkspaceFileV6Error);
        }
    });

    it("rejects binary bytes that cannot be interpreted as UTF-8", () => {
        expect(() => decodeWorkspaceFileV6TextRead({
            ok: true, revision: REV, mode: 0o644, data: "/w==",
        })).toThrow(WorkspaceFileV6Error);
    });

    it("accepts worker list names but does not invent per-entry revisions", () => {
        expect(decodeWorkspaceFileV6Directory({
            ok: true,
            entries: [{ name: "main.py", kind: "file", size: 5 },
                { name: "src", kind: "directory", size: 4096 }],
        })).toEqual([{ name: "main.py", kind: "file", size: 5 },
            { name: "src", kind: "directory", size: 4096 }]);
    });

    it("rejects malformed/duplicated directory entries", () => {
        for (const entries of [
            null, [{ name: "../escape", kind: "file", size: 1 }],
            [{ name: "a", kind: "file", size: 1 }, { name: "a", kind: "file", size: 2 }],
            [{ name: "src", kind: "link", size: 1 }],
            Array.from({ length: 257 }, (_, i) => ({ name: `item${i}`, kind: "file", size: 0 })),
        ]) {
            expect(() => decodeWorkspaceFileV6Directory({ ok: true, entries })).toThrow(WorkspaceFileV6Error);
        }
    });

    it("reads existing server file without silently acknowledging it as editor baseline", async () => {
        const transport = vi.fn(async () => read("server version"));
        const coordinator = new WorkspaceFileRevisionV6("session_1", transport);
        const result = await coordinator.readText("main.py");
        expect(result).toMatchObject({ exists: true, content: "server version", revision: REV });
        expect(coordinator.stateFor("main.py")).toEqual({ state: "unknown" });
        await expect(coordinator.writeText("main.py", "local draft")).rejects.toMatchObject({
            code: "REVISION_NOT_LOADED",
        });
        coordinator.acknowledgeRead("main.py", REV);
        expect(coordinator.stateFor("main.py")).toEqual({ state: "known", revision: REV });
    });

    it("keeps conflict blocked after fresh read until editor explicitly reconciles", async () => {
        const transport = vi.fn()
            .mockRejectedValueOnce(new WorkspaceFileV6Error("CONFLICT", 409))
            .mockResolvedValueOnce(read("terminal version"));
        const coordinator = new WorkspaceFileRevisionV6("session_1", transport);
        coordinator.acknowledgeRead("main.py", REV);
        await expect(coordinator.writeText("main.py", "unsaved local draft")).rejects.toMatchObject({ code: "CONFLICT" });
        const result = await coordinator.readText("main.py");
        expect(result).toMatchObject({ content: "terminal version" });
        expect(coordinator.stateFor("main.py")).toEqual({ state: "conflict" });
        await expect(coordinator.writeText("main.py", "silent overwrite")).rejects.toMatchObject({
            code: "CONFLICT_REQUIRES_RELOAD",
        });
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it("confirms missing file by successful parent listing before allowing an absence acknowledgment", async () => {
        const transport = vi.fn().mockRejectedValueOnce(
            new WorkspaceFileV6Error("NOT_FOUND", 404),
        ).mockResolvedValueOnce({ ok: true, entries: [{ name: "other.py", kind: "file", size: 5 }] });
        const coordinator = new WorkspaceFileRevisionV6("session_1", transport);
        expect(await coordinator.readText("src/main.py")).toEqual({ exists: false });
        expect(transport.mock.calls[1][1]).toEqual({ op: "list", path: "src" });
        expect(coordinator.stateFor("src/main.py")).toEqual({ state: "unknown" });
        coordinator.acknowledgeRead("src/main.py", null);
        expect(coordinator.stateFor("src/main.py")).toEqual({ state: "known", revision: null });
    });

    it("never treats disabled proxy's 404 response as confirmed absence", async () => {
        const transport = vi.fn().mockRejectedValue(
            new WorkspaceFileV6Error("NOT_FOUND", 404),
        );
        const coordinator = new WorkspaceFileRevisionV6("session_1", transport);
        await expect(coordinator.readText("main.py")).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(coordinator.stateFor("main.py")).toEqual({ state: "unknown" });
    });

    it("requires another read if directory entry exists after a 404 race", async () => {
        const transport = vi.fn().mockRejectedValueOnce(
            new WorkspaceFileV6Error("NOT_FOUND", 404),
        ).mockResolvedValueOnce({ ok: true, entries: [{ name: "main.py", kind: "file", size: 1 }] });
        const coordinator = new WorkspaceFileRevisionV6("session_1", transport);
        await expect(coordinator.readText("main.py")).rejects.toMatchObject({ code: "READ_RACE" });
        expect(coordinator.stateFor("main.py")).toEqual({ state: "unknown" });
    });

    it("refuses binary extensions and invalid paths before network access", async () => {
        const transport = vi.fn();
        const coordinator = new WorkspaceFileRevisionV6("session_1", transport);
        await expect(coordinator.readText("image.png")).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
        await expect(coordinator.readText("../private.txt")).rejects.toMatchObject({ code: "INVALID_PATH" });
        expect(transport).not.toHaveBeenCalled();
    });

    it("serializes a read behind a pending write on the same file", async () => {
        let complete!: (result: { ok: true; revision: string }) => void;
        const pending = new Promise<{ ok: true; revision: string }>((resolve) => { complete = resolve; });
        const transport = vi.fn().mockImplementationOnce(() => pending)
            .mockResolvedValueOnce(read("after write"));
        const coordinator = new WorkspaceFileRevisionV6("session_1", transport);
        coordinator.acknowledgeRead("main.py", REV);
        const write = coordinator.writeText("main.py", "first");
        const reload = coordinator.readText("main.py");
        await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
        complete({ ok: true, revision: REV });
        await write;
        expect(await reload).toMatchObject({ content: "after write" });
        expect(transport.mock.calls[1][1]).toEqual({ op: "read", path: "main.py" });
    });

    it("does not acknowledge a read after session disposal", async () => {
        let complete!: (result: ReturnType<typeof read>) => void;
        const pending = new Promise<ReturnType<typeof read>>((resolve) => { complete = resolve; });
        const transport = vi.fn(() => pending);
        const coordinator = new WorkspaceFileRevisionV6("session_1", transport);
        const reload = coordinator.readText("main.py");
        await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
        coordinator.dispose();
        complete(read("late response"));
        await expect(reload).rejects.toMatchObject({ code: "SESSION_DISPOSED" });
    });
});
