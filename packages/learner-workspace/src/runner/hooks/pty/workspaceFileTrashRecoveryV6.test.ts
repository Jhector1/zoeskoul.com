import { describe, expect, it, vi } from "vitest";
import { requestWorkspaceFileV6 } from "./workspaceFileClientV6";

const sha = `sha256:${"f".repeat(64)}`;
const token = "0123456789abcdef0123456789abcdef";
const success = (body: object) => ({ ok: true, status: 200, json: async () => body } as Response);

describe("V6B4e3 recoverable directory trash browser transport", () => {
  it("forwards an inspected revision and returns the opaque trash identifier", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => success({ ok: true, trashed: true, trashId: token }));
    const result = await requestWorkspaceFileV6("session", { op: "trash_directory", path: "src/folder", expectedRevision: sha }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.trashId).toBe(token);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string))
      .toEqual({ op: "trash_directory", path: "src/folder", expectedRevision: sha });
  });
  it("lists recoverable folders using the existing authenticated proxy", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => success({ ok: true, entries: [{ originalPath: "src/folder", trashId: token }] }));
    const result = await requestWorkspaceFileV6("session", { op: "list_trash", path: "" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.entries).toEqual([{ originalPath: "src/folder", trashId: token }]);
  });
  it("restores with an absence precondition and never falls back to V5", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => success({ ok: true, restored: true }));
    await requestWorkspaceFileV6("session", { op: "restore_directory", path: "src/folder", trashId: token, expectedRevision: null }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string))
      .toEqual({ op: "restore_directory", path: "src/folder", trashId: token, expectedRevision: null });
  });
  it("rejects unknown tokens before touching the network", async () => {
    const fetchImpl = vi.fn();
    await expect(requestWorkspaceFileV6("session", { op: "restore_directory", path: "src/folder", trashId: "not-a-token", expectedRevision: null }, { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects a missing SHA before touching the network", async () => {
    const fetchImpl = vi.fn();
    await expect(requestWorkspaceFileV6("session", { op: "trash_directory", path: "src/folder", expectedRevision: "invalid" }, { fetchImpl: fetchImpl as unknown as typeof fetch }))
      .rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
