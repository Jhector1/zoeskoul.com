import { describe, expect, it, vi } from "vitest";
import { requestWorkspaceFileV6 } from "./workspaceFileClientV6";

const revision = `sha256:${"c".repeat(64)}`;
const session = "session_zoelearning";
const fetchOk = () => vi.fn(async () => Response.json({ ok: true, moved: true, kind: "file" })) as unknown as typeof fetch;

describe("V6B4e browser structural file operations", () => {
    it("sends a revision-checked rename to the same-origin authenticated proxy", async () => {
        const fetchImpl = fetchOk();
        await requestWorkspaceFileV6(session, {
            op: "move", path: "src/main.py", destinationPath: "src/new.py", expectedRevision: revision,
        }, { fetchImpl });
        const [url, config] = vi.mocked(fetchImpl).mock.calls[0]!;
        expect(url).toContain("/files/operation");
        expect(config?.credentials).toBe("same-origin");
        expect(JSON.parse(String(config?.body))).toEqual({
            op: "move", path: "src/main.py", destinationPath: "src/new.py", expectedRevision: revision,
        });
        expect(config?.headers).not.toHaveProperty("X-Runner-Secret");
    });

    it("requires a revision before moving a file", async () => {
        const fetchImpl = fetchOk();
        await expect(requestWorkspaceFileV6(session, {
            op: "move", path: "main.py", destinationPath: "renamed.py", expectedRevision: undefined as any,
        }, { fetchImpl })).rejects.toMatchObject({ code: "INVALID_REVISION" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("refuses invalid destination paths before network I/O", async () => {
        const fetchImpl = fetchOk();
        await expect(requestWorkspaceFileV6(session, {
            op: "move", path: "main.py", destinationPath: "../other/private.py", expectedRevision: revision,
        }, { fetchImpl })).rejects.toMatchObject({ code: "INVALID_PATH" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("refuses a no-op move at the client boundary", async () => {
        const fetchImpl = fetchOk();
        await expect(requestWorkspaceFileV6(session, {
            op: "move", path: "main.py", destinationPath: "main.py", expectedRevision: revision,
        }, { fetchImpl })).rejects.toMatchObject({ code: "INVALID_PATH" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("forwards an empty directory deletion with explicit null precondition", async () => {
        const fetchImpl = fetchOk();
        await requestWorkspaceFileV6(session, { op: "rmdir", path: "src/empty", expectedRevision: null }, { fetchImpl });
        expect(JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]![1]?.body))).toEqual({
            op: "rmdir", path: "src/empty", expectedRevision: null,
        });
    });

    it("never retries a nonempty-folder conflict", async () => {
        const fetchImpl = vi.fn(async () => Response.json({
            ok: false, code: "DIRECTORY_NOT_EMPTY",
        }, { status: 409 })) as unknown as typeof fetch;
        await expect(requestWorkspaceFileV6(session, {
            op: "rmdir", path: "src/nonempty", expectedRevision: null,
        }, { fetchImpl })).rejects.toMatchObject({ code: "DIRECTORY_NOT_EMPTY", status: 409 });
        expect(fetchImpl).toHaveBeenCalledOnce();
    });
});
