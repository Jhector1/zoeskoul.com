import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, deleteSession, pushEvent } from "../services/sessions/sessionStore.js";
import { snapshotWorkspaceRoute } from "./sessions.snapshotWorkspace.js";
import { snapshotWorkspaceFiles } from "../services/workspace/snapshotWorkspaceFiles.js";
import { snapshotWorkspaceViaLearnerWorker } from "../services/workspace/snapshotWorkspaceViaLearnerWorker.js";

vi.mock("../services/workspace/snapshotWorkspaceFiles.js", async (load) => {
  const actual = await load<typeof import("../services/workspace/snapshotWorkspaceFiles.js")>();
  return { ...actual, snapshotWorkspaceFiles: vi.fn() };
});
vi.mock("../services/workspace/snapshotWorkspaceViaLearnerWorker.js", () => ({
  snapshotWorkspaceViaLearnerWorker: vi.fn(),
}));

const direct = vi.mocked(snapshotWorkspaceFiles);
const worker = vi.mocked(snapshotWorkspaceViaLearnerWorker);
const ID = "sess-stage4b9bf3af-unit";

function req(actor = "learner-a") {
  return { params: { sessionId: ID }, header: (name: string) => {
    if (name.toLowerCase() === "x-actor-key") return actor;
    if (name.toLowerCase() === "x-runner-secret") return "test-secret";
    return "";
  }} as any;
}
function response() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((status: number) => {res.statusCode = status; return res;});
  res.json = vi.fn((data: unknown) => {res.body = data; return res;});
  return res;
}

let dir: string;

beforeEach(async () => {
  vi.stubEnv("RUNNER_EXECUTION_POOL", "zoeskoul-learning");
  vi.stubEnv("RUNNER_LEARNING_SNAPSHOT_WORKER_ENABLED", "true");
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-snapshot-fallback-"));
  createSession({id:ID, ownerKey:"learner-a", kind:"shell", containerId:"test-container", workspaceDir:dir});
  pushEvent(ID, {type:"status",state:"waiting_for_input"});
  const restricted = Object.assign(new Error("private test path"), { code: "EACCES" });
  direct.mockReset();
  worker.mockReset();
  direct.mockRejectedValue(restricted);
  worker.mockResolvedValue([{kind:"file",path:"private/report.txt",content:"secret"}]);
});

afterEach(async () => {
  deleteSession(ID);
  vi.unstubAllEnvs();
  await fs.rm(dir,{recursive:true,force:true});
});

describe("Learning-only snapshot worker fallback authorization", () => {
  it("returns a complete worker snapshot only for an active authorized learner shell", async () => {
    const res = response();
    await snapshotWorkspaceRoute(req(),res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toMatchObject({ok:true,files:[{kind:"file",path:"private/report.txt",content:"secret"}]});
    expect(worker).toHaveBeenCalledTimes(1);
  });

  it("rejects another actor without invoking either snapshot path", async () => {
    const res = response();
    await snapshotWorkspaceRoute(req("other-learner"),res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(direct).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });

  it("does not use worker when the dedicated fallback switch is disabled", async () => {
    vi.stubEnv("RUNNER_LEARNING_SNAPSHOT_WORKER_ENABLED", "false");
    const res = response();
    await snapshotWorkspaceRoute(req(),res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(worker).not.toHaveBeenCalled();
  });

  it("does not invoke worker after terminal completion", async () => {
    pushEvent(ID, {type:"status",state:"completed"});
    const res = response();
    await snapshotWorkspaceRoute(req(),res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(worker).not.toHaveBeenCalled();
  });

  it("does not invoke worker in the ZoeBuild execution pool", async () => {
    vi.stubEnv("RUNNER_EXECUTION_POOL", "zoebuild");
    const res = response();
    await snapshotWorkspaceRoute(req(),res,vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(worker).not.toHaveBeenCalled();
  });
});
