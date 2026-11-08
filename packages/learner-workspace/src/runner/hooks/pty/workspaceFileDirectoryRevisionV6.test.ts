import { describe, expect, it, vi } from "vitest";
import { requestWorkspaceFileV6 } from "./workspaceFileClientV6";

const sha = `sha256:${"d".repeat(64)}`;
const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);

describe("V6B4e2 directory operation browser transport", () => {
  it("posts the inspect operation through the existing proxy", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response({ ok: true, kind: "directory", revision: sha, entryCount: 1, totalBytes: 7 }));
    const result = await requestWorkspaceFileV6("session", { op: "inspect", path: "src/folder" }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.revision).toBe(sha);
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toMatchObject({ op: "inspect", path: "src/folder" });
  });
  it("posts move_directory with its last inspected SHA", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => response({ ok: true, moved: true, kind: "directory", revision: sha }));
    await requestWorkspaceFileV6("session", { op: "move_directory", path: "src/folder", destinationPath: "src/new-folder", expectedRevision: sha }, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toMatchObject({ op: "move_directory", destinationPath: "src/new-folder", expectedRevision: sha });
  });
  it("rejects invalid SHA before network access", async () => {
    const fetchImpl = vi.fn();
    await expect(requestWorkspaceFileV6("session", { op: "move_directory", path: "src/folder", destinationPath: "src/new-folder", expectedRevision: "bad" }, { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
