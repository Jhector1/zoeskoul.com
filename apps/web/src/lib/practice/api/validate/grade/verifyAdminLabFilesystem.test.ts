import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({
  authorize:vi.fn(),
  actorKey:vi.fn(),
  actorKeyOf:vi.fn(),
  runnerPost:vi.fn(),
  isCurrentApproved:vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/learning/server/authorizeStudentAdminLab", () => ({authorizeStudentAdminLab:mocks.authorize}));
vi.mock("@/lib/server/runnerActorKey", () => ({requireRunnerActorKey:mocks.actorKey}));
vi.mock("@/lib/practice/actor", () => ({actorKeyOf:mocks.actorKeyOf}));
vi.mock("@/lib/server/runnerClient", () => ({runnerPost:mocks.runnerPost}));
// Unit-test the grading adapter independently of the compiled curriculum
// registry; the real digest and release approval are covered by
// approvedPublishedCourse2Capstone.test.ts.
vi.mock("@/lib/practice/adminLab/approvedPublishedCourse2Capstone", () => ({
  isCurrentApprovedCourse2FinalInstance:mocks.isCurrentApproved,
}));
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
  mocks.actorKeyOf.mockReturnValue("u:"+"a".repeat(64));
  mocks.runnerPost.mockResolvedValue({ok:true,passed:true,failedPaths:[]});
  mocks.isCurrentApproved.mockReturnValue(false);
});
describe("reuse existing practice grading with Runner filesystem evidence", () => {
  it("grades only trusted Runner evidence and avoids sending browser transcripts", async () => {
    const result = await verify();
    expect(result.ok).toBe(true);
    expect(mocks.actorKeyOf).toHaveBeenCalledWith(base.actor);
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
  it("fails closed when a different student owns the Runner identity", async () => {
    mocks.actorKeyOf.mockReturnValueOnce("u:"+"b".repeat(64));
    const result = await verify();
    expect(result.ok).toBe(false);
    expect(result.infrastructureFailure?.status).toBe(503);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects incomplete final capstone contracts before contacting the Runner", async () => {
    const finalInstance = {...instance, exerciseKey: "final-capstone-secure-project-step-5",
      topic: {...instance.topic, slug: "final-capstone-secure-project",
        module: {...instance.topic.module, slug: "linux-module-4-secure-project-capstone"}}};
    const partial = await verify({instance: finalInstance});
    expect(partial.infrastructureFailure?.status).toBe(503);
    expect(mocks.runnerPost).not.toHaveBeenCalled();

    const complete = {kind: "code_input", adminLabPublishedTopicSha256: "a".repeat(64), adminLabFilesystemExpectations: {required: [
      {path: "/workspace/secure-project", kind: "directory", mode: "0755", uid: 1000, gid: 1000},
      {path: "/workspace/secure-project/README.md", kind: "file", mode: "0644", uid: 0, gid: 0},
      {path: "/workspace/secure-project/scripts", kind: "directory", mode: "0700", uid: 1000, gid: 1000},
      {path: "/workspace/secure-project/scripts/run.sh", kind: "file", mode: "0700", uid: 1000, gid: 1000},
      {path: "/workspace/secure-project/secrets.env", kind: "file", mode: "0600", uid: 1000, gid: 1000},
      {path: "/workspace/secure-project/shared", kind: "directory", mode: "0770", uid: 1000, gid: 1000},
      {path: "/workspace/secure-project/shared/notes.txt", kind: "file", mode: "0640", uid: 1000, gid: 1000},
    ]}};
    // Seven correct filesystem paths alone are not enough. Until the
    // approved-version resolver authorizes this persisted instance, the
    // Runner must not be contacted or the submission graded.
    const persistedFinalInstance = {...finalInstance, secretPayload: {expected: complete}};
    const unapproved = await verify({instance: persistedFinalInstance,
      persistedExpected: complete, effectiveExpected: complete});
    expect(unapproved.ok).toBe(false);
    expect(unapproved.infrastructureFailure?.status).toBe(503);
    expect(mocks.isCurrentApproved).toHaveBeenCalledWith(persistedFinalInstance);
    expect(mocks.runnerPost).not.toHaveBeenCalled();

    // A successful approval is supplied by the dedicated release resolver;
    // here we isolate the verifier's downstream Runner authorization path.
    mocks.isCurrentApproved.mockReturnValueOnce(true);
    const full = await verify({instance: persistedFinalInstance,
      persistedExpected: complete, effectiveExpected: complete});
    expect(full.ok).toBe(true);
    expect(mocks.runnerPost).toHaveBeenCalledWith("/sessions/admin/verify-filesystem", "u:"+"a".repeat(64), {
      topicSlug: "final-capstone-secure-project", expected: complete.adminLabFilesystemExpectations,
    });
  });

  it("fails closed if canonical actor identity resolution throws", async () => {
    mocks.actorKeyOf.mockImplementationOnce(() => {throw new Error("PRIVATE_IDENTITY_FAILURE");});
    const result = await verify();
    expect(result.ok).toBe(false);
    expect(result.infrastructureFailure?.status).toBe(503);
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });

  it("rejects mismatched lessons, malformed authored expectations and missing answers", async () => {
    expect((await verify({instance:{...instance,topic:{...instance.topic,slug:"other"}}})).infrastructureFailure).toBeDefined();
    expect((await verify({effectiveExpected:{...expected,adminLabFilesystemExpectations:{required:[]}}})).infrastructureFailure).toBeDefined();
    expect((await verify({answer:null})).infrastructureFailure).toBeDefined();
    expect(mocks.runnerPost).not.toHaveBeenCalled();
  });
});
