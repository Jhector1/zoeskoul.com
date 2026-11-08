import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { WorkspaceFileRevisionV6 } from "./workspaceFileRevisionV6";
import { WorkspaceFileV6Error } from "./workspaceFileClientV6";
import { assertWorkspaceFileV6BinaryData, decodeWorkspaceFileV6BinaryRead } from "./workspaceFileBinaryV6";
import { pushWorkspaceFileDeltaV6 } from "./workspaceFileDeltaSyncV6";

const rev = (letter: string) => `sha256:${letter.repeat(64)}`;
const image = (path: string, data: string): WorkspaceSyncEntry => ({
    kind: "file", path, encoding: "base64", data, mimeType: "image/png",
    sizeBytes: atob(data).length,
});
const textFile = (path: string, content: string): WorkspaceSyncEntry => ({ kind: "file", path, content });
const binaryResponse = (data: string) => ({ ok: true as const, revision: rev("a"), mode: 0o644, data });
const file404 = () => new WorkspaceFileV6Error("NOT_FOUND", 404);

function harness(baseline: WorkspaceSyncEntry[], desired: WorkspaceSyncEntry[], transport: any) {
    const revision = new WorkspaceFileRevisionV6("session-binary", transport);
    const committed: Array<[string, WorkspaceSyncEntry | null]> = [];
    return {
        revision, committed,
        run: (getLatestEntries = () => desired) => pushWorkspaceFileDeltaV6({
            revision, baseline, desired, getLatestEntries,
            onCommitted: (path, entry) => committed.push([path, entry]),
        }),
    };
}

describe("V6B4e4b binary CAS synchronization", () => {
    it("decodes non-UTF8 bytes without changing them", () => {
        expect(decodeWorkspaceFileV6BinaryRead(binaryResponse("/wAB/w=="))).toEqual({
            exists: true, revision: rev("a"), mode: 0o644, data: "/wAB/w==", sizeBytes: 4,
        });
    });

    it("refuses malformed canonical data and mismatched sizes before network", async () => {
        const transport = vi.fn();
        const session = new WorkspaceFileRevisionV6("session-binary", transport);
        session.acknowledgeRead("image.png", null);
        for (const data of ["a", "@@", "AA=A", "AA==AAAA", "_w=="]) {
            expect(() => assertWorkspaceFileV6BinaryData(data)).toThrow(WorkspaceFileV6Error);
            await expect(session.writeBinary("image.png", data)).rejects.toMatchObject({ code: "INVALID_DATA" });
        }
        await expect(session.writeBinary("image.png", "AA==", 2)).rejects.toMatchObject({ code: "INVALID_DATA" });
        expect(transport).not.toHaveBeenCalled();
    });

    it("rejects corrupted worker binary replies", () => {
        for (const response of [
            { ...binaryResponse("AQ=="), revision: "no" },
            { ...binaryResponse("AQ=="), mode: 1024 },
            { ...binaryResponse("AA=A") },
            { ...binaryResponse("AQ=="), data: "\u00e9" },
        ]) {
            expect(() => decodeWorkspaceFileV6BinaryRead(response)).toThrow(WorkspaceFileV6Error);
        }
    });

    it("updates binary bytes only after confirming the remote bytes and revision", async () => {
        const before = image("image.png", "/wAB");
        const after = image("image.png", "AQID");
        const transport = vi.fn().mockResolvedValueOnce(binaryResponse("/wAB"))
            .mockResolvedValueOnce({ ok: true, revision: rev("b") });
        const test = harness([before], [after], transport);
        await test.run();
        expect(transport.mock.calls.map((call: any) => call[1].op)).toEqual(["read", "write"]);
        expect(transport.mock.calls[1][1]).toEqual({
            op: "write", path: "image.png", expectedRevision: rev("a"), data: "AQID",
        });
        expect(test.committed).toEqual([["image.png", after]]);
        expect(test.revision.stateFor("image.png")).toEqual({ state: "known", revision: rev("b") });
    });

    it("rejects terminal-edited binary data without overwriting the local draft", async () => {
        const transport = vi.fn().mockResolvedValue(binaryResponse("AQID"));
        const test = harness([image("image.png", "/wAB")], [image("image.png", "AgME")], transport);
        await expect(test.run()).rejects.toMatchObject({ code: "CONFLICT" });
        expect(transport).toHaveBeenCalledOnce();
        expect(test.committed).toEqual([]);
    });

    it("never treats a disabled Web proxy's 404 as proof an image is absent", async () => {
        const transport = vi.fn().mockRejectedValue(file404());
        const test = harness([], [image("image.png", "/wAB")], transport);
        await expect(test.run()).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(transport.mock.calls.map((call: any) => call[1].op)).toEqual(["read", "list"]);
        expect(test.committed).toEqual([]);
    });

    it("creates an image only after a successful parent listing confirms absence", async () => {
        const transport = vi.fn().mockRejectedValueOnce(file404())
            .mockResolvedValueOnce({ ok: true, entries: [] })
            .mockResolvedValueOnce({ ok: true, revision: rev("b") });
        const test = harness([], [image("src/image.png", "/wAB")], transport);
        await test.run();
        expect(transport.mock.calls[1][1]).toEqual({ op: "list", path: "src" });
        expect(transport.mock.calls[2][1].expectedRevision).toBeNull();
    });

    it("deletes a binary file using its last verified revision", async () => {
        const transport = vi.fn().mockResolvedValueOnce(binaryResponse("AQID"))
            .mockResolvedValueOnce({ ok: true, deleted: true });
        const test = harness([image("image.png", "AQID")], [], transport);
        await test.run();
        expect(transport.mock.calls[1][1]).toEqual({
            op: "delete", path: "image.png", expectedRevision: rev("a"),
        });
        expect(test.committed).toEqual([["image.png", null]]);
    });

    it("does not accept changing text into binary by rewriting the same path", async () => {
        const transport = vi.fn();
        await expect(harness([textFile("diagram.svg", "<svg/>")], [image("diagram.svg", "AQID")], transport).run())
            .rejects.toMatchObject({ code: "FILE_FORMAT_CHANGE_REQUIRES_EXPLICIT_ACTION" });
        expect(transport).not.toHaveBeenCalled();
    });

    it("refuses binary content on a text-capability extension", async () => {
        const transport = vi.fn();
        await expect(harness([], [image("diagram.svg", "AQID")], transport).run())
            .rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
        expect(transport).not.toHaveBeenCalled();
    });

    it("refuses invalid binary size metadata before performing any read", async () => {
        const transport = vi.fn();
        const inconsistent = { ...image("image.png", "AQID"), sizeBytes: 99 } as WorkspaceSyncEntry;
        await expect(harness([], [inconsistent], transport).run()).rejects.toMatchObject({ code: "INVALID_DATA" });
        expect(transport).not.toHaveBeenCalled();
    });

    it("aborts a binary write if the local image changes while preflight is running", async () => {
        const transport = vi.fn().mockResolvedValueOnce(binaryResponse("AQID"));
        const after = image("image.png", "AQIE");
        const test = harness([image("image.png", "AQID")], [after], transport);
        await expect(test.run(() => [image("image.png", "AQIF")]))
            .rejects.toMatchObject({ code: "LOCAL_DRAFT_CHANGED" });
        expect(transport).toHaveBeenCalledOnce();
    });

    it("preserves partial commits and blocks automatic retries after network uncertainty", async () => {
        const transport = vi.fn().mockResolvedValueOnce(binaryResponse("AQID"))
            .mockResolvedValueOnce(binaryResponse("AgME"))
            .mockResolvedValueOnce({ ok: true, revision: rev("b") })
            .mockRejectedValueOnce(new WorkspaceFileV6Error("NETWORK_UNAVAILABLE", 0));
        const beforeA = image("a.png", "AQID");
        const beforeB = image("b.png", "AgME");
        const afterA = image("a.png", "AQIE");
        const afterB = image("b.png", "AgMF");
        const test = harness([beforeA, beforeB], [afterA, afterB], transport);
        await expect(test.run()).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
        expect(test.committed).toEqual([["a.png", afterA]]);
        expect(test.revision.stateFor("b.png")).toEqual({ state: "needs_read" });
    });

    it("continues blocking folder mutation when binary support is enabled", async () => {
        const transport = vi.fn();
        await expect(harness([{ kind: "directory", path: "assets" }], [], transport).run())
            .rejects.toMatchObject({ code: "STRUCTURAL_CHANGE_REQUIRES_V6_INTEGRATION" });
        expect(transport).not.toHaveBeenCalled();
    });
});
