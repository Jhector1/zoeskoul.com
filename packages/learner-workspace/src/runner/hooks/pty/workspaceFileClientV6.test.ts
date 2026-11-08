import { describe, expect, it, vi } from "vitest";
import {
    encodeWorkspaceFileV6Text,
    isWorkspaceFileV6Conflict,
    requestWorkspaceFileV6,
    WorkspaceFileV6Error,
} from "./workspaceFileClientV6";

const SESSION = "student-session_1";
const REVISION = `sha256:${"a".repeat(64)}`;

function fetchResponse(body: unknown, status = 200) {
    return vi.fn(async () => Response.json(body, { status })) as unknown as typeof fetch;
}

describe("V6B4a browser Learning file client", () => {
    it("encodes Unicode as UTF-8 base64, not Latin-1", () => {
        expect(encodeWorkspaceFileV6Text("Bonjou 🌴 — 世界"))
            .toBe("Qm9uam91IPCfjLQg4oCUIOS4lueVjA==");
    });

    it("posts to the existing same-origin endpoint without a Runner secret", async () => {
        const fetchImpl = fetchResponse({ ok: true, revision: REVISION });
        const output = await requestWorkspaceFileV6(SESSION, {
            op: "write",
            path: "lessons/main.py",
            expectedRevision: null,
            data: encodeWorkspaceFileV6Text("print('hello')\n"),
        }, { fetchImpl });
        expect(output.revision).toBe(REVISION);
        expect(fetchImpl).toHaveBeenCalledOnce();
        const [url, config] = vi.mocked(fetchImpl).mock.calls[0]!;
        expect(url).toBe(`/api/run/pty/sessions/${SESSION}/files/operation`);
        expect(config).toMatchObject({
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            headers: { "Content-Type": "application/json" },
        });
        expect(JSON.parse(String(config?.body))).toEqual({
            op: "write", path: "lessons/main.py", expectedRevision: null,
            data: encodeWorkspaceFileV6Text("print('hello')\n"),
        });
        expect(config?.headers).not.toHaveProperty("X-Runner-Secret");
    });

    it("passes through last-acknowledged revision on updates", async () => {
        const fetchImpl = fetchResponse({ ok: true });
        await requestWorkspaceFileV6(SESSION, {
            op: "write", path: "main.py", expectedRevision: REVISION,
            data: encodeWorkspaceFileV6Text("new version"),
        }, { fetchImpl });
        const [, config] = vi.mocked(fetchImpl).mock.calls[0]!;
        expect(JSON.parse(String(config?.body)).expectedRevision).toBe(REVISION);
    });

    it("retains revision conflicts as typed errors without a fallback write", async () => {
        const fetchImpl = fetchResponse({ ok: false, code: "CONFLICT" }, 409);
        const failure = await requestWorkspaceFileV6(SESSION, {
            op: "write", path: "main.py", expectedRevision: REVISION,
            data: encodeWorkspaceFileV6Text("unsaved local edit"),
        }, { fetchImpl }).catch(error => error);
        expect(isWorkspaceFileV6Conflict(failure)).toBe(true);
        expect(failure).toBeInstanceOf(WorkspaceFileV6Error);
        expect(failure.status).toBe(409);
        expect(fetchImpl).toHaveBeenCalledOnce();
    });

    it.each([
        [401, "UNAUTHORIZED"],
        [403, "FORBIDDEN"],
        [404, "NOT_FOUND"],
        [413, "BODY_TOO_LARGE"],
        [428, "PRECONDITION_REQUIRED"],
        [503, "FILE_PROXY_UNAVAILABLE"],
    ])("propagates a safe error code for HTTP %i", async (status, code) => {
        const fetchImpl = fetchResponse({ ok: false, code }, status);
        await expect(requestWorkspaceFileV6(SESSION, { op: "list", path: "" }, { fetchImpl }))
            .rejects.toMatchObject({ status, code });
    });

    it("does not call the network for missing revision on mutation", async () => {
        const fetchImpl = fetchResponse({ ok: true });
        await expect(requestWorkspaceFileV6(SESSION, {
            op: "delete", path: "main.py", expectedRevision: undefined as any,
        }, { fetchImpl })).rejects.toMatchObject({ code: "INVALID_REVISION" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("does not call the network for traversal paths", async () => {
        const fetchImpl = fetchResponse({ ok: true });
        await expect(requestWorkspaceFileV6(SESSION, {
            op: "read", path: "../another-student/private.py",
        }, { fetchImpl })).rejects.toMatchObject({ code: "INVALID_PATH" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("does not call the network for invalid session identifiers", async () => {
        const fetchImpl = fetchResponse({ ok: true });
        await expect(requestWorkspaceFileV6("../bad", { op: "list", path: "" }, { fetchImpl }))
            .rejects.toMatchObject({ code: "INVALID_SESSION" });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("does not accept malformed success envelopes", async () => {
        const fetchImpl = fetchResponse({ success: true });
        await expect(requestWorkspaceFileV6(SESSION, { op: "read", path: "main.py" }, { fetchImpl }))
            .rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    });

    it("does not retry if the request cannot reach the server", async () => {
        const fetchImpl = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
        await expect(requestWorkspaceFileV6(SESSION, { op: "list", path: "" }, { fetchImpl }))
            .rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
        expect(fetchImpl).toHaveBeenCalledOnce();
    });
});
