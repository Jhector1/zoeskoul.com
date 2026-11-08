import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { requireServiceAuth } from "../middleware/serviceAuth.js";
import { createSession, deleteSession, getSession } from "../services/sessions/sessionStore.js";
import { sessionsWorkspaceFileRoute } from "./sessions.workspaceFileRoute.js";
import { runWorkspaceFileWorker } from "../services/workspace/workspaceFileDockerExec.js";

vi.mock("../lib/env.js", async (original) => {
  const result = await original<typeof import("../lib/env.js")>();
  return { env: { ...result.env, runnerSharedSecret: "v6b2-ephemeral-secret", workspaceFileApiEnabled: true } };
});
vi.mock("../services/workspace/workspaceFileDockerExec.js", () => ({
  runWorkspaceFileWorker: vi.fn(),
  WorkspaceFileUnavailableError: class WorkspaceFileUnavailableError extends Error {},
}));

let server: Server;
let baseUrl: string;
const SESSION = "v6b2-http-session";

async function post(body: unknown, opts: { secret?: string; actor?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.secret !== "") headers["x-runner-secret"] = opts.secret ?? "v6b2-ephemeral-secret";
  if (opts.actor !== "") headers["x-actor-key"] = opts.actor ?? "u:owner";
  const response = await fetch(`${baseUrl}/sessions/${SESSION}/files/operation`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(requireServiceAuth);
  app.post("/sessions/:sessionId/files/operation", sessionsWorkspaceFileRoute);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected ephemeral TCP address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});
beforeEach(() => {
  vi.stubEnv("RUNNER_EXECUTION_POOL", "zoeskoul-learning");
  createSession({ id: SESSION, ownerKey: "u:owner", kind: "shell", containerId: "fake-v6b2", workspaceDir: "/tmp/v6b2-http-workspace" });
  getSession(SESSION)!.state = "waiting_for_input";
  vi.mocked(runWorkspaceFileWorker).mockResolvedValue({ ok: true, revision: `sha256:${"a".repeat(64)}`, data: "YQ==" });
});
afterEach(() => {
  deleteSession(SESSION);
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("V6B2 actual HTTP service auth -> session authorization", () => {
  it("rejects missing service secret before touching Docker", async () => {
    const result = await post({ op: "read", path: "main.c" }, { secret: "" });
    expect(result.status).toBe(403);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });
  it("rejects wrong service secret before touching Docker", async () => {
    const result = await post({ op: "read", path: "main.c" }, { secret: "wrong" });
    expect(result.status).toBe(403);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });
  it("rejects missing actor key before touching Docker", async () => {
    const result = await post({ op: "read", path: "main.c" }, { actor: "" });
    expect(result.status).toBe(403);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });
  it("rejects another student's session", async () => {
    const result = await post({ op: "read", path: "main.c" }, { actor: "u:other" });
    expect(result.status).toBe(403);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });
  it("rejects the route when this server is configured for ZoeBuild", async () => {
    vi.stubEnv("RUNNER_EXECUTION_POOL", "zoebuild");
    const result = await post({ op: "read", path: "main.c" });
    expect(result.status).toBe(404);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });
  it("returns 428 for missing revision", async () => {
    const result = await post({ op: "write", path: "main.c", data: "YQ==" });
    expect(result.status).toBe(428);
    expect(runWorkspaceFileWorker).not.toHaveBeenCalled();
  });
  it("passes a valid authenticated operation to the worker", async () => {
    const result = await post({ op: "read", path: "main.c" });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(runWorkspaceFileWorker).toHaveBeenCalledTimes(1);
  });
  it("returns a proper 409 when the worker detects stale content", async () => {
    vi.mocked(runWorkspaceFileWorker).mockResolvedValue({ ok: false, code: "CONFLICT" });
    const result = await post({ op: "delete", path: "main.c", expectedRevision: `sha256:${"b".repeat(64)}` });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("CONFLICT");
  });
});
