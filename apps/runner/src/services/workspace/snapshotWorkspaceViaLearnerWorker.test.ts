import crypto from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { runWorkspaceFileWorker } from "./workspaceFileDockerExec.js";
import { snapshotWorkspaceViaLearnerWorker } from "./snapshotWorkspaceViaLearnerWorker.js";

vi.mock("./workspaceFileDockerExec.js", () => ({
  runWorkspaceFileWorker: vi.fn(),
}));

const mocked = vi.mocked(runWorkspaceFileWorker);
const session = {
  id: "sess-test",
  ownerKey: "actor-a",
  kind: "shell",
  workspaceDir: "/workspaces/zoeskoul-run-12345678-1234-1234-1234-123456789abc",
  containerId: "owned-container",
} as Parameters<typeof snapshotWorkspaceViaLearnerWorker>[0];

type Reply = Awaited<ReturnType<typeof runWorkspaceFileWorker>>;

function readReply(bytes: Buffer) {
  return {
    ok: true as const,
    data: bytes.toString("base64"),
    revision: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
  };
}

/**
 * Queue exact worker responses without a default rejected implementation.
 * In the target Vitest run the default rejection superseded queued replies,
 * so all six tests failed before exercising their intended assertions.
 * Once replies are exhausted, this vi.fn mock returns undefined and the
 * production worker wrapper fails closed. Each test also asserts the complete
 * request operation/path sequence, so extra calls cannot pass unnoticed.
 */
function queueReplies(...replies: unknown[]) {
  for (const reply of replies) {
    mocked.mockResolvedValueOnce(reply as Reply);
  }
}

function requestOrder(): Array<[string | undefined, string | undefined]> {
  return mocked.mock.calls.map(([, request]) => [request?.op, request?.path]);
}

beforeEach(() => mocked.mockReset());

describe("restricted-directory snapshot through existing non-root worker", () => {
  it("walks owner-readable nested mode-0700 directories and preserves text and binary", async () => {
    queueReplies(
      { ok: true, entries: [{ name: "private", kind: "directory", size: 4096 }] },
      { ok: true, entries: [
        { name: "report.txt", kind: "file", size: 6 },
        { name: "pixel.png", kind: "file", size: 3 },
      ] },
      readReply(Buffer.from([0, 255, 1])),
      readReply(Buffer.from("secret")),
    );
    const files = await snapshotWorkspaceViaLearnerWorker(session);
    expect(files).toEqual(expect.arrayContaining([
      { kind: "directory", path: "private" },
      { kind: "file", path: "private/report.txt", content: "secret" },
      expect.objectContaining({
        kind: "file", path: "private/pixel.png", encoding: "base64", data: "AP8B",
      }),
    ]));
    expect(mocked).toHaveBeenCalledTimes(4);
    expect(requestOrder()).toEqual([
      ["list", ""], ["list", "private"],
      ["read", "private/pixel.png"], ["read", "private/report.txt"],
    ]);
  });

  it("never emits partial results after an unreadable nested directory", async () => {
    queueReplies(
      { ok: true, entries: [{ name: "private", kind: "directory", size: 4096 }] },
      { ok: false, code: "FILESYSTEM_ERROR" },
    );
    await expect(snapshotWorkspaceViaLearnerWorker(session))
      .rejects.toMatchObject({ code: "EACCES" });
    expect(requestOrder()).toEqual([["list", ""], ["list", "private"]]);
  });

  it("does not request hidden runtime state or protected recovery trash", async () => {
    queueReplies(
      { ok: true, entries: [
        { name: ".git", kind: "directory", size: 10 },
        { name: ".zoe-v6-trash", kind: "directory", size: 10 },
        { name: "main.py", kind: "file", size: 2 },
      ] },
      readReply(Buffer.from("ok")),
    );
    const files = await snapshotWorkspaceViaLearnerWorker(session);
    expect(files).toEqual([{ kind: "file", path: "main.py", content: "ok" }]);
    expect(requestOrder()).toEqual([["list", ""], ["read", "main.py"]]);
  });

  it("rejects invalid worker filenames without traversing outside the workspace", async () => {
    queueReplies({ ok: true, entries: [{ name: "../escape", kind: "file", size: 1 }] });
    await expect(snapshotWorkspaceViaLearnerWorker(session))
      .rejects.toMatchObject({ code: "EACCES" });
    expect(requestOrder()).toEqual([["list", ""]]);
  });

  it("rejects changed, truncated or forged worker read checksums", async () => {
    queueReplies(
      { ok: true, entries: [{ name: "main.py", kind: "file", size: 2 }] },
      { ok: true, data: "b2s=", revision: `sha256:${"0".repeat(64)}` },
    );
    await expect(snapshotWorkspaceViaLearnerWorker(session))
      .rejects.toMatchObject({ code: "EACCES" });
    expect(requestOrder()).toEqual([["list", ""], ["read", "main.py"]]);
  });

  it("rejects malformed base64, rather than returning partial success", async () => {
    queueReplies(
      { ok: true, entries: [{ name: "main.py", kind: "file", size: 2 }] },
      { ok: true, data: "%%!", revision: `sha256:${"0".repeat(64)}` },
    );
    await expect(snapshotWorkspaceViaLearnerWorker(session))
      .rejects.toMatchObject({ code: "EACCES" });
    expect(requestOrder()).toEqual([["list", ""], ["read", "main.py"]]);
  });
});
