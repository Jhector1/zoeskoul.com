import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, deleteSession, getSession } from "../services/sessions/sessionStore.js";
import { sessionsWorkspaceFileRoute } from "./sessions.workspaceFileRoute.js";
import { runWorkspaceFileWorker } from "../services/workspace/workspaceFileDockerExec.js";

vi.mock("../lib/env.js", async (original) => {
  const result = await original<typeof import("../lib/env.js")>();
  return { env: { ...result.env, workspaceFileApiEnabled: true } };
});
vi.mock("../services/workspace/workspaceFileDockerExec.js", () => ({
  runWorkspaceFileWorker: vi.fn(),
  WorkspaceFileUnavailableError: class WorkspaceFileUnavailableError extends Error {},
}));

function request(actor = "owner", body: unknown = { op: "read", path: "main.c" }) {
  return {
    params: { sessionId: "v6a-session" },
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

beforeEach(() => {
  vi.stubEnv("RUNNER_EXECUTION_POOL", "zoeskoul-learning");
  createSession({ id: "v6a-session", ownerKey: "owner", kind: "shell", containerId: "c1", workspaceDir: "/tmp/zoe-v6a" });
  getSession("v6a-session")!.state = "waiting_for_input";
});
afterEach(() => {
  deleteSession("v6a-session");
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("V6A internal file API", () => {
  it("returns forbidden before looking at files", async () => {
    const res = response();
    await sessionsWorkspaceFileRoute(request("another-user"), res, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });
  it("rejects missing revision", async () => {
    const res = response();
    await sessionsWorkspaceFileRoute(request("owner", {op: "write", path: "main.c", data: "YQ=="}), res, vi.fn());
    expect(res.statusCode).toBe(428);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });
  it("returns the worker's read response", async () => {
    vi.mocked(runWorkspaceFileWorker).mockResolvedValue({ ok: true, revision: `sha256:${"a".repeat(64)}`, data: "YQ==" });
    const res = response();
    await sessionsWorkspaceFileRoute(request(), res, vi.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, data: "YQ==" });
  });
  it("preserves conflict status", async () => {
    vi.mocked(runWorkspaceFileWorker).mockResolvedValue({ ok: false, code: "CONFLICT" });
    const res = response();
    await sessionsWorkspaceFileRoute(request("owner", {op: "delete", path: "main.c", expectedRevision: `sha256:${"a".repeat(64)}`}), res, vi.fn());
    expect(res.statusCode).toBe(409);
  });
  it("cannot operate on a completed shell session", async () => {
    getSession("v6a-session")!.state = "completed";
    const res = response();
    await sessionsWorkspaceFileRoute(request(), res, vi.fn());
    expect(res.statusCode).toBe(409);
  });
});
