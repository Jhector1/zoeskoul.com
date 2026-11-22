import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  check: vi.fn(), read: vi.fn(), load: vi.fn(), actor: vi.fn(), post: vi.fn(),
}));
vi.mock("next/server", () => ({
  NextResponse: {json: (value: unknown, options?: ResponseInit) => Response.json(value, options)},
}));
vi.mock("@/lib/admin/curriculumDraftRoute", () => ({
  runAdminCurriculumDraftRoute: (_request: Request, run: () => Promise<Response>) => run(),
  adminCurriculumDraftOptions: vi.fn(),
}));
vi.mock("@/lib/dev/curriculumDrafts/adminLabQaExercises", () => ({
  loadDraftAdminQaExpected: mocks.load,
}));
vi.mock("@/lib/dev/curriculumDrafts/adminLabQaHttp", () => ({
  checkDraftAdminQaRequest: mocks.check,
  readDraftAdminQaBody: mocks.read,
  rejectDraftAdminQa: (error: string, status: number) =>
    Response.json({ok: false, error, draftQa: true}, {status}),
}));
vi.mock("@/lib/server/runnerActorKey", () => ({requireRunnerActorKey: mocks.actor}));
vi.mock("@/lib/server/runnerClient", () => ({runnerPost: mocks.post}));

import {POST} from "./route";

const actorKey = `u:${"a".repeat(64)}`;
const expected = {required:[{path:"/workspace/secure-project/README.md",
  kind:"file", mode:"0644", uid:0, gid:0}]};
const topicSlug = "final-capstone-secure-project";
const key = "draft-admin-fs-qa.v1.final-capstone-secure-project.capstone-qa-minimal-modes";
const request = () => new Request("http://localhost/api/admin/curriculum-drafts/admin-lab/verify", {
  method: "POST", headers:{"content-type":"application/json"}, body: JSON.stringify({key}),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.check.mockReturnValue(null);
  mocks.read.mockResolvedValue({key});
  mocks.load.mockResolvedValue({topicSlug, expected});
  mocks.actor.mockResolvedValue(actorKey);
  mocks.post.mockResolvedValue({ok:true, passed:true, failedPaths:[]});
});

describe("author-only actual capstone filesystem verification bridge", () => {
  it("uses trusted server expectations, exact topic and actor, never client-supplied paths", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ok:true, draftQa:true, passed:true, finalized:false});
    expect(mocks.load).toHaveBeenCalledWith(key);
    expect(mocks.post).toHaveBeenCalledWith("/sessions/admin/verify-filesystem", actorKey,
      {topicSlug, expected});
  });
  it("reports a trusted failed-path check as FAIL, not credit", async () => {
    mocks.post.mockResolvedValue({ok:true, passed:false, failedPaths:["/workspace/secure-project/README.md"]});
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ok:false, draftQa:true, passed:false, attempts:null, finalized:false});
  });
  it("fails closed on a Runner or verification infrastructure failure", async () => {
    mocks.post.mockResolvedValue({ok:false, passed:false, failedPaths:[]});
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });
  it("rejects browser-supplied grading expectations", async () => {
    mocks.read.mockResolvedValue({key, expected});
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("rejects untrusted or invalid actor identity", async () => {
    mocks.actor.mockResolvedValue("invalid");
    const res = await POST(request());
    expect(res.status).toBe(403);
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
