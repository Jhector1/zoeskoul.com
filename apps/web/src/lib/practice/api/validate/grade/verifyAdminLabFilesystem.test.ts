import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({
  authorize:vi.fn(),
  actorKey:vi.fn(),
  runnerPost:vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/learning/server/authorizeStudentAdminLab", () => ({authorizeStudentAdminLab:mocks.authorize}));
vi.mock("@/lib/server/runnerActorKey", () => ({requireRunnerActorKey:mocks.actorKey}));
vi.mock("@/lib/server/runnerClient", () => ({runnerPost:mocks.runnerPost}));
import {verifyAdminLabFilesystemForPractice} from "./verifyAdminLabFilesystem";
const target = {topicSlug:"sudo-root-concepts",moduleSlug:"linux-module-3-users-groups-troubleshooting"};
const expected = {kind:"code_input",adminLabFilesystemExpectations:{required:[{path:"/workspace/project",kind:"directory",mode:"0750"}]}};
const instance = {
  kind:"code_input",
  topic:{slug:target.topicSlug,subjectId:"subject",subject:{slug:"linux-files-permissions-users"},module:{slug:target.moduleSlug,subject:{slug:"linux-files-permissions-users",id:"subject"}}},
};
const base = {instance:instance as any,actor:{userId:"user",guestId:null},request:new Request("https://zoeskoul.test"),
  answer:{kind:"code_input",code:""} as any,persistedExpected:expected,effectiveExpected:expected};
const verify = (changes: Record<string,unknown>={}) => verifyAdminLabFilesystemForPractice({...base,...changes} as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue(true);
  mocks.actorKey.mockResolvedValue("u:"+"a".repeat(64));
  mocks.runnerPost.mockResolvedValue({ok:true,passed:true,failedPaths:[]});
});
describe("reuse existing practice grading with Runner filesystem evidence", () => {
  it("grades only trusted Runner evidence and avoids sending browser transcripts", async () => {
    const result = await verify();
    expect(result.ok).toBe(true);
    expect(mocks.runnerPost).toHaveBeenCalledWith("/sessions/admin/verify-filesystem", "u:"+"a".repeat(64), {
      topicSlug:target.topicSlug,expected:expected.adminLabFilesystemExpectations,
    });
  });
  it("uses existing attempt decision when genuine metadata does not match", async () => {
    mocks.runnerPost.mockResolvedValueOnce({ok:true,passed:false,failedPaths:["/workspace/project"]});
    const result = await verify();
    expect(result.ok).toBe(false);
    expect(result.infrastructureFailure).toBeUndefined();
  });
  it("does not consume attempts when enrollment or Runner is unavailable", async () => {
    mocks.authorize.mockResolvedValueOnce(false);
    expect((await verify()).infrastructureFailure?.status).toBe(503);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
    mocks.runnerPost.mockRejectedValueOnce(new Error("offline"));
    expect((await verify()).infrastructureFailure?.status).toBe(503);
  });
  it("rejects mismatched lessons, malformed authored expectations and missing answers", async () => {
    expect((await verify({instance:{...instance,topic:{...instance.topic,slug:"other"}}})).infrastructureFailure).toBeDefined();
    expect((await verify({effectiveExpected:{...expected,adminLabFilesystemExpectations:{required:[]}}})).infrastructureFailure).toBeDefined();
    expect((await verify({answer:null})).infrastructureFailure).toBeDefined();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });
});
