import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { WorkspaceFileRevisionV6 } from "./workspaceFileRevisionV6";
import { WorkspaceFileV6Error } from "./workspaceFileClientV6";
import { pushWorkspaceFileDeltaV6 } from "./workspaceFileDeltaSyncV6";

const rev = (character: string) => `sha256:${character.repeat(64)}`;
const file = (path: string, content: string): WorkspaceSyncEntry =>
    ({ kind: "file", path, content });
const dir = (path: string): WorkspaceSyncEntry => ({ kind: "directory", path });
const read = (content: string) => ({
    ok: true as const,
    revision: rev("a"),
    mode: 0o644,
    data: btoa(String.fromCharCode(...new TextEncoder().encode(content))),
});

function setup(baseline: WorkspaceSyncEntry[], desired: WorkspaceSyncEntry[], transport: any) {
    const committed: Array<[string, WorkspaceSyncEntry | null]> = [];
    const revision = new WorkspaceFileRevisionV6("student-session", transport);
    return {
        committed,
        revision,
        run: (getLatestEntries = () => desired) => pushWorkspaceFileDeltaV6({
            revision, baseline, desired, getLatestEntries,
            onCommitted: (path, next) => committed.push([path, next]),
        }),
    };
}

describe("V6B4e4 opt-in single-authority text writer", () => {
    it("writes an existing text file only after a verified server read", async () => {
        const transport = vi.fn().mockResolvedValueOnce(read("before"))
            .mockResolvedValueOnce({ ok: true, revision: rev("b") });
        const harness = setup([file("main.py", "before")], [file("main.py", "after")], transport);
        await harness.run();
        expect(transport.mock.calls.map((call: any) => call[1].op)).toEqual(["read", "write"]);
        expect(transport.mock.calls[1][1].expectedRevision).toBe(rev("a"));
        expect(harness.committed).toEqual([["main.py", file("main.py", "after")]]);
    });

    it("fails closed when terminal content differs and preserves draft", async () => {
        const transport = vi.fn().mockResolvedValue(read("terminal changed"));
        const harness = setup([file("main.py", "before")], [file("main.py", "editor draft")], transport);
        await expect(harness.run()).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
        expect(transport).toHaveBeenCalledTimes(1);
        expect(harness.committed).toEqual([]);
    });

    it("preflights every edited file before any mutation", async () => {
        const transport = vi.fn().mockResolvedValueOnce(read("a"))
            .mockResolvedValueOnce(read("changed by terminal"));
        const harness = setup(
            [file("a.py", "a"), file("b.py", "b")],
            [file("a.py", "edited a"), file("b.py", "edited b")], transport,
        );
        await expect(harness.run()).rejects.toMatchObject({ code: "CONFLICT" });
        expect(transport.mock.calls.map((call: any) => call[1].op)).toEqual(["read", "read"]);
        expect(harness.committed).toEqual([]);
    });

    it("creates a new file only after authoritative 404 plus successful parent list", async () => {
        const transport = vi.fn().mockRejectedValueOnce(new WorkspaceFileV6Error("NOT_FOUND", 404))
            .mockResolvedValueOnce({ ok: true, entries: [] })
            .mockResolvedValueOnce({ ok: true, revision: rev("b") });
        const harness = setup([], [file("notes.txt", "new")], transport);
        await harness.run();
        expect(transport.mock.calls.map((call: any) => call[1].op)).toEqual(["read", "list", "write"]);
        expect(transport.mock.calls[2][1].expectedRevision).toBeNull();
    });

    it("does not convert a proxy 404 into permission to create a file", async () => {
        const transport = vi.fn().mockRejectedValueOnce(new WorkspaceFileV6Error("NOT_FOUND", 404))
            .mockRejectedValueOnce(new WorkspaceFileV6Error("NOT_FOUND", 404));
        const harness = setup([], [file("notes.txt", "new")], transport);
        await expect(harness.run()).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(transport).toHaveBeenCalledTimes(2);
        expect(harness.committed).toEqual([]);
    });

    it("deletes only the old acknowledged revision", async () => {
        const transport = vi.fn().mockResolvedValueOnce(read("before"))
            .mockResolvedValueOnce({ ok: true, deleted: true });
        const harness = setup([file("main.py", "before")], [], transport);
        await harness.run();
        expect(transport.mock.calls[1][1]).toMatchObject({
            op: "delete", path: "main.py", expectedRevision: rev("a"),
        });
        expect(harness.committed).toEqual([["main.py", null]]);
    });

    it("never maps folder deletion to recursive file deletes", async () => {
        const transport = vi.fn();
        const harness = setup([dir("work")], [], transport);
        await expect(harness.run()).rejects.toMatchObject({
            code: "STRUCTURAL_CHANGE_REQUIRES_V6_INTEGRATION",
        });
        expect(transport).not.toHaveBeenCalled();
    });

    it("refuses to approximate an atomic move as delete plus create", async () => {
        const transport = vi.fn();
        const harness = setup([file("before.py", "x")], [file("after.py", "x")], transport);
        await expect(harness.run()).rejects.toMatchObject({ code: "MOVE_REQUIRES_V6_INTEGRATION" });
        expect(transport).not.toHaveBeenCalled();
    });

    it("leaves unchanged binary files alone and revision-checks binary updates", async () => {
        const original: WorkspaceSyncEntry = {
            kind: "file", path: "image.png", encoding: "base64",
            data: "AA==", mimeType: "image/png", sizeBytes: 1,
        };
        const newer: WorkspaceSyncEntry = { ...original, data: "AQ==" };
        const transport = vi.fn()
            .mockResolvedValueOnce({ ok: true, revision: rev("a"), mode: 0o644, data: "AA==" })
            .mockResolvedValueOnce({ ok: true, revision: rev("b") });

        await setup([original], [original], transport).run();
        expect(transport).not.toHaveBeenCalled();

        const harness = setup([original], [newer], transport);
        await harness.run();
        expect(transport.mock.calls.map((call: any) => call[1].op)).toEqual(["read", "write"]);
        expect(transport.mock.calls[1][1]).toMatchObject({
            op: "write", path: "image.png", expectedRevision: rev("a"), data: "AQ==",
        });
        expect(harness.committed).toEqual([["image.png", newer]]);
    });

    it("preserves a binary draft when the terminal changed its previous bytes", async () => {
        const original: WorkspaceSyncEntry = {
            kind: "file", path: "image.png", encoding: "base64",
            data: "AA==", mimeType: "image/png", sizeBytes: 1,
        };
        const newer: WorkspaceSyncEntry = { ...original, data: "AQ==" };
        const transport = vi.fn().mockResolvedValue({
            ok: true, revision: rev("a"), mode: 0o644, data: "Ag==",
        });
        const harness = setup([original], [newer], transport);
        await expect(harness.run()).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
        expect(transport.mock.calls.map((call: any) => call[1].op)).toEqual(["read"]);
        expect(harness.committed).toEqual([]);
    });

    it("aborts before mutation when the local editor changes during preflight", async () => {
        const transport = vi.fn().mockResolvedValueOnce(read("old"));
        const harness = setup([file("x.py", "old")], [file("x.py", "pending")], transport);
        await expect(harness.run(() => [file("x.py", "newer draft")]))
            .rejects.toMatchObject({ code: "LOCAL_DRAFT_CHANGED" });
        expect(transport).toHaveBeenCalledTimes(1);
        expect(harness.committed).toEqual([]);
    });

    it("tracks acknowledged first-file commits if a later write fails", async () => {
        const transport = vi.fn()
            .mockResolvedValueOnce(read("old a"))
            .mockResolvedValueOnce(read("old b"))
            .mockResolvedValueOnce({ ok: true, revision: rev("b") })
            .mockRejectedValueOnce(new WorkspaceFileV6Error("NETWORK_UNAVAILABLE", 0));
        const harness = setup(
            [file("a.py", "old a"), file("b.py", "old b")],
            [file("a.py", "edit a"), file("b.py", "edit b")], transport,
        );
        await expect(harness.run()).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
        expect(harness.committed).toEqual([["a.py", file("a.py", "edit a")]]);
        expect(harness.revision.stateFor("b.py")).toEqual({ state: "needs_read" });
    });

    it("never normalizes traversal into an allowed path", async () => {
        const transport = vi.fn();
        const harness = setup([file("a/../main.py", "old")], [file("a/../main.py", "new")], transport);
        await expect(harness.run()).rejects.toMatchObject({ code: "INVALID_PATH" });
        expect(transport).not.toHaveBeenCalled();
    });
});
