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

function req(body: unknown): Request {
  return new Request("https://example.test/api/run/pty/sessions/session-1/files/operation", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ sessionId: "session-1" }) };

beforeEach(() => {
  vi.stubEnv("ZOESKOUL_V6_FILE_PROXY_ENABLED", "true");
  mocks.requireRunnerActorKey.mockReset().mockResolvedValue("u:actor");
  mocks.runnerPost.mockReset().mockResolvedValue({ ok: true, entries: [] });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V6B guarded Web proxy", () => {
  it("is absent by default and does not invoke authentication or Runner", async () => {
    vi.stubEnv("ZOESKOUL_V6_FILE_PROXY_ENABLED", "false");
    const response = await POST(req({ op: "list", path: "" }), ctx);
    expect(response.status).toBe(404);
    expect(mocks.requireRunnerActorKey).not.toHaveBeenCalled();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });
  it("requires authentication before sending any operation to Runner", async () => {
    mocks.requireRunnerActorKey.mockRejectedValue(new Error("Unauthorized"));
    const response = await POST(req({ op: "read", path: "main.c" }), ctx);
    expect(response.status).toBe(401);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });
  it("forwards to the owner-scoped Learning session endpoint", async () => {
    const body = { op: "list", path: "", maxBytes: 1024 };
    const response = await POST(req(body), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.runnerPost).toHaveBeenCalledWith(
      "/sessions/session-1/files/operation", "u:actor", body,
    );
  });
  it("preserves the Runner's 409 conflict without exposing internal messages", async () => {
    mocks.runnerPost.mockRejectedValue(new RunnerHttpError(409, "internal path", "CONFLICT"));
    const response = await POST(req({ op: "write", path: "main.c" }), ctx);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "CONFLICT" });
  });
  it("preserves missing precondition as 428", async () => {
    mocks.runnerPost.mockRejectedValue(new RunnerHttpError(428, "missing", "PRECONDITION_REQUIRED"));
    const response = await POST(req({ op: "write", path: "main.c" }), ctx);
    expect(response.status).toBe(428);
  });
  it("rejects oversized JSON before calling the Runner", async () => {
    const response = await POST(req({ op: "read", path: "x".repeat(530_000) }), ctx);
    expect(response.status).toBe(413);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });
  it("rejects invalid session ID before calling the Runner", async () => {
    const response = await POST(req({ op: "list" }), {
      params: Promise.resolve({ sessionId: "../bad" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });
});
