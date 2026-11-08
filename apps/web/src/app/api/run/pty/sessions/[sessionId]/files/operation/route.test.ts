import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRunnerActorKey: vi.fn(),
  runnerPost: vi.fn(),
}));

vi.mock("@/lib/server/runnerActorKey", () => ({
  requireRunnerActorKey: mocks.requireRunnerActorKey,
}));
vi.mock("@/lib/server/runnerClient", () => ({
  runnerPost: mocks.runnerPost,
  RunnerHttpError: class RunnerHttpError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

import { POST } from "./route";
import { RunnerHttpError } from "@/lib/server/runnerClient";

const OWNER = `u:${"a".repeat(64)}`;
const URL = "https://example.test/api/run/pty/sessions/session-1/files/operation";
const ctx = { params: Promise.resolve({ sessionId: "session-1" }) };

function req(
  body: unknown,
  opts: { origin?: string | null; contentType?: string | null; url?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.origin !== null) headers.Origin = opts.origin ?? "https://example.test";
  if (opts.contentType !== null) headers["Content-Type"] = opts.contentType ?? "application/json";
  return new Request(opts.url ?? URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

beforeEach(() => {
  vi.stubEnv("ZOESKOUL_V6_FILE_PROXY_ENABLED", "true");
  vi.stubEnv("APP_ORIGIN", "");
  mocks.requireRunnerActorKey.mockReset().mockResolvedValue(OWNER);
  mocks.runnerPost.mockReset().mockResolvedValue({ ok: true, entries: [] });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V6B2 guarded Learning file Web proxy", () => {
  it("is absent by default before any authentication or forwarding", async () => {
    vi.stubEnv("ZOESKOUL_V6_FILE_PROXY_ENABLED", "false");
    const response = await POST(req({ op: "list", path: "" }, { origin: null }), ctx);
    expect(response.status).toBe(404);
    expect(mocks.requireRunnerActorKey).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects missing Origin before authentication or forwarding", async () => {
    const response = await POST(req({ op: "list", path: "" }, { origin: null }), ctx);
    expect(response.status).toBe(403);
    expect(mocks.requireRunnerActorKey).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests before authentication or forwarding", async () => {
    const response = await POST(req({ op: "list", path: "" }, { origin: "https://attacker.test" }), ctx);
    expect(response.status).toBe(403);
    expect(mocks.requireRunnerActorKey).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects text/plain browser requests even from the expected origin", async () => {
    const response = await POST(req({ op: "list", path: "" }, { contentType: "text/plain" }), ctx);
    expect(response.status).toBe(415);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("accepts a separately configured public origin behind a reverse proxy", async () => {
    vi.stubEnv("APP_ORIGIN", "https://school.example");
    const response = await POST(req({ op: "list", path: "" }, {
      origin: "https://school.example",
      url: "http://internal-web:3000/api/run/pty/sessions/session-1/files/operation",
    }), ctx);
    expect(response.status).toBe(200);
  });

  it("requires authentication before sending an operation to Runner", async () => {
    mocks.requireRunnerActorKey.mockRejectedValue(new Error("Unauthorized"));
    const response = await POST(req({ op: "read", path: "main.c" }), ctx);
    expect(response.status).toBe(401);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects the shared PTY development fallback actor", async () => {
    mocks.requireRunnerActorKey.mockResolvedValue(`e2e:${"b".repeat(64)}`);
    const response = await POST(req({ op: "write", path: "main.c" }), ctx);
    expect(response.status).toBe(401);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("forwards an authenticated, same-origin operation using the real actor", async () => {
    const body = { op: "list", path: "", maxBytes: 1024 };
    const response = await POST(req(body), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(mocks.runnerPost).toHaveBeenCalledWith(
      "/sessions/session-1/files/operation", OWNER, body,
    );
  });

  it("preserves the Runner's 409 conflict without exposing internal messages", async () => {
    mocks.runnerPost.mockRejectedValue(new RunnerHttpError(409, "internal path", "CONFLICT"));
    const response = await POST(req({ op: "write", path: "main.c" }), ctx);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "CONFLICT" });
  });

  it("preserves missing revision as 428", async () => {
    mocks.runnerPost.mockRejectedValue(new RunnerHttpError(428, "missing", "PRECONDITION_REQUIRED"));
    const response = await POST(req({ op: "write", path: "main.c" }), ctx);
    expect(response.status).toBe(428);
  });

  it("preserves cross-student session rejection without exposing internal messages", async () => {
    mocks.runnerPost.mockRejectedValue(new RunnerHttpError(403, "other user's workspace", "FORBIDDEN"));
    const response = await POST(req({ op: "read", path: "main.c" }), ctx);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("keeps non-write requests bounded to 512 KiB", async () => {
    const response = await POST(req({ op: "read", path: "x".repeat(530_000) }), ctx);
    expect(response.status).toBe(413);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("forwards a V6 base64 write that exceeds the old 512 KiB proxy limit", async () => {
    const body = {
      op: "write", path: "notes.txt", expectedRevision: null,
      data: Buffer.alloc(450_000, 0x61).toString("base64"),
    };
    const response = await POST(req(body), ctx);
    expect(response.status).toBe(200);
    expect(mocks.runnerPost).toHaveBeenCalledWith(
      "/sessions/session-1/files/operation", OWNER, body,
    );
  });

  it("rejects requests above the strict 7 MiB limit before Runner forwarding", async () => {
    const body = {
      op: "write", path: "notes.txt", expectedRevision: null,
      data: "A".repeat(7 * 1024 * 1024),
    };
    const response = await POST(req(body), ctx);
    expect(response.status).toBe(413);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated large writes before parsing their bodies", async () => {
    mocks.requireRunnerActorKey.mockRejectedValue(new Error("Unauthorized"));
    const response = await POST(req({
      op: "write", path: "notes.txt", expectedRevision: null,
      data: Buffer.alloc(450_000, 0x61).toString("base64"),
    }), ctx);
    expect(response.status).toBe(401);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects invalid session IDs before calling Runner", async () => {
    const response = await POST(req({ op: "list" }), {
      params: Promise.resolve({ sessionId: "../bad" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("fails closed on a malformed Runner response", async () => {
    mocks.runnerPost.mockResolvedValue({ error: "internal" });
    const response = await POST(req({ op: "list", path: "" }), ctx);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, code: "INVALID_RUNNER_RESPONSE" });
  });

  it("fails closed on Runner unavailability", async () => {
    mocks.runnerPost.mockRejectedValue(new Error("socket terminated /tmp/internal"));
    const response = await POST(req({ op: "read", path: "main.c" }), ctx);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: "FILE_PROXY_UNAVAILABLE" });
  });
});
