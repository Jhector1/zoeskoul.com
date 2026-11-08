import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, deleteSession, getSession } from "../services/sessions/sessionStore.js";
import { sessionsWorkspaceFileRoute } from "./sessions.workspaceFileRoute.js";
import { runWorkspaceFileWorker, WorkspaceFileUnavailableError } from "../services/workspace/workspaceFileDockerExec.js";
import { withWorkspaceSyncLock } from "../services/workspace/workspaceSyncLock.js";
import { isExecutionPoolPathAllowed } from "../middleware/executionPoolGuard.js";

const mocks = vi.hoisted(() => ({
  beforeLock: vi.fn(),
}));

vi.mock("../lib/env.js", async (original) => {
  const result = await original<typeof import("../lib/env.js")>();
  return { env: { ...result.env, workspaceFileApiEnabled: true } };
});
vi.mock("../services/workspace/workspaceFileDockerExec.js", () => ({
  runWorkspaceFileWorker: vi.fn(),
  WorkspaceFileUnavailableError: class WorkspaceFileUnavailableError extends Error {},
}));
vi.mock("../services/workspace/workspaceSyncLock.js", () => ({
  withWorkspaceSyncLock: vi.fn(async (_dir: string, action: () => Promise<unknown>) => {
    await mocks.beforeLock();
    return action();
  }),
}));

function request(actor = "u:owner", body: unknown = { op: "read", path: "main.c" }) {
  return {
    params: { sessionId: "v6b2-test-session" },
    body,
    header: (key: string) => key === "x-actor-key" ? actor : "",
  } as any;
}
function response() {
  const res: any = {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status: vi.fn((status: number) => { res.statusCode = status; return res; }),
    json: vi.fn((data: unknown) => { res.body = data; return res; }),
  };
  return res;
}
async function call(actor?: string, body?: unknown) {
  const res = response();
  await sessionsWorkspaceFileRoute(request(actor, body), res, vi.fn());
  return res;
}

beforeEach(() => {
  vi.stubEnv("RUNNER_EXECUTION_POOL", "zoeskoul-learning");
  createSession({
    id: "v6b2-test-session", ownerKey: "u:owner", kind: "shell",
    containerId: "c-test", workspaceDir: "/tmp/v6b2-test-workspace",
  });
  getSession("v6b2-test-session")!.state = "waiting_for_input";
  vi.mocked(runWorkspaceFileWorker).mockResolvedValue({ ok: true, data: "YQ==" });
  mocks.beforeLock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  deleteSession("v6b2-test-session");
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("V6B2 Learning Runner security and lifecycle", () => {
  it("rejects the file API in the ZoeBuild pool before worker access", async () => {
    vi.stubEnv("RUNNER_EXECUTION_POOL", "zoebuild");
    const res = await call();
    expect(res.statusCode).toBe(404);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
    expect(withWorkspaceSyncLock).not.toHaveBeenCalled();
    expect(isExecutionPoolPathAllowed("zoebuild", "POST", "/sessions/v6b2-test-session/files/operation")).toBe(false);
    expect(isExecutionPoolPathAllowed("zoeskoul-learning", "POST", "/sessions/v6b2-test-session/files/operation")).toBe(true);
  });

  it("rejects cross-student access before parsing or executing files", async () => {
    const res = await call("u:another-student");
    expect(res.statusCode).toBe(403);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });

  it("rejects completed sessions before worker access", async () => {
    getSession("v6b2-test-session")!.state = "completed";
    const res = await call();
    expect(res.statusCode).toBe(409);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });

  it("rejects a session that expires while waiting for the workspace queue", async () => {
    mocks.beforeLock.mockImplementation(() => {
      getSession("v6b2-test-session")!.state = "completed";
    });
    const res = await call();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: "SESSION_INACTIVE" });
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });

  it("rejects a session removed while waiting for the workspace queue", async () => {
    mocks.beforeLock.mockImplementation(() => deleteSession("v6b2-test-session"));
    const res = await call();
    expect(res.statusCode).toBe(409);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });

  it("rejects missing write revision before executing the worker", async () => {
    const res = await call("u:owner", { op: "write", path: "main.c", data: "YQ==" });
    expect(res.statusCode).toBe(428);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });

  it("rejects path traversal before executing the worker", async () => {
    const res = await call("u:owner", { op: "read", path: "../etc/passwd" });
    expect(res.statusCode).toBe(400);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });

  it("preserves a worker revision conflict as HTTP 409", async () => {
    vi.mocked(runWorkspaceFileWorker).mockResolvedValue({ ok: false, code: "CONFLICT" });
    const res = await call("u:owner", { op: "delete", path: "main.c", expectedRevision: `sha256:${"a".repeat(64)}` });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("reports worker unavailability without internal Docker details", async () => {
    vi.mocked(runWorkspaceFileWorker).mockRejectedValue(new WorkspaceFileUnavailableError());
    const res = await call();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ ok: false, code: "WORKER_UNAVAILABLE" });
  });

  it("executes an owned active session exactly once", async () => {
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(runWorkspaceFileWorker).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ ok: true, data: "YQ==" });
  });
});
