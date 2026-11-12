import {beforeEach, describe, expect, it, vi} from "vitest";

const SESSION_ID = "sess_11111111-1111-4111-8111-111111111111";
const VOLUME = `zoeskoul-admin-ws-${SESSION_ID}`;
const IMAGE = "sha256:" + "a".repeat(64);
const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(), createContainer: vi.fn(),
  getActiveSessionsForActor: vi.fn(),
  verifyAdminWorkspaceVolume: vi.fn(),
  assertAdminLabSwitch: vi.fn(() => 2),
  adminLabConfiguration: vi.fn(() => ({image: IMAGE})),
}));
vi.mock("../docker/dockerClient.js", () => ({docker: {
  getContainer: mocks.getContainer, createContainer: mocks.createContainer,
}}));
vi.mock("../sessions/sessionStore.js", () => ({getActiveSessionsForActor: mocks.getActiveSessionsForActor}));
vi.mock("./adminWorkspaceVolume.js", () => ({verifyAdminWorkspaceVolume: mocks.verifyAdminWorkspaceVolume}));
vi.mock("./learningAdminSwitch.js", () => ({assertAdminLabSwitch: mocks.assertAdminLabSwitch}));
vi.mock("./learningAdminGrant.js", () => ({adminLabConfiguration: mocks.adminLabConfiguration}));
import {verifyAdminFilesystem} from "./adminFilesystemEvidence.js";

const session = {
  id:SESSION_ID, ownerKey:"actor",containerId:"student", labMode:"admin",
  adminTopicSlug:"sudo-root-concepts",state:"waiting_for_input",adminVolumeName:VOLUME,
};
let learner:any;
let sidecar:any;
function checked(path="/workspace/project") {
  return {actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{
    required:[{path,kind:"directory" as const,mode:"0750"}],
  }};
}
function learnerInspect(overrides: Record<string,unknown>={}) {
  return {
    State:{Running:true},
    Config:{Image:IMAGE, User:"0:0",Labels:{
      "com.zoeskoul.runner.session":SESSION_ID,
      "com.zoeskoul.runner.lab-mode":"admin",
      "com.zoeskoul.runner.purpose":"learn",
    }},
    HostConfig:{Privileged:false,NetworkMode:"none",Tmpfs:{"/tmp":"rw"},Binds:[]},
    Mounts:[{Destination:"/workspace",Type:"volume",Name:VOLUME,RW:true}],
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAdminLabSwitch.mockReturnValue(2);
  mocks.adminLabConfiguration.mockReturnValue({image:IMAGE});
  mocks.verifyAdminWorkspaceVolume.mockResolvedValue(undefined);
  mocks.getActiveSessionsForActor.mockReturnValue([session]);
  learner = {inspect:vi.fn(async()=>learnerInspect())};
  sidecar = {
    inspect:vi.fn(async()=>({HostConfig:{NetworkMode:"none",ReadonlyRootfs:true,
      Privileged:false,Binds:[],CapAdd:[],CapDrop:["ALL"],
      Mounts:[{Source:VOLUME,ReadOnly:true}]}})),
    start:vi.fn(async()=>undefined),
    wait:vi.fn(async()=>({StatusCode:0})),
    logs:vi.fn(async()=>Buffer.from('{"ok":true,"failedPaths":[]}\n')),
    remove:vi.fn(async()=>undefined),
  };
  mocks.createContainer.mockResolvedValue(sidecar);
  mocks.getContainer.mockImplementation((name:string)=>name==="student"?learner:sidecar);
});

describe("admin filesystem grading via read-only shared tmpfs", () => {
  it("inspects a private memory-backed workspace without student command execution",async()=>{
    const result=await verifyAdminFilesystem(checked());
    expect(result).toEqual({passed:true,failedPaths:[]});
    const created=mocks.createContainer.mock.calls[0][0];
    expect(created.HostConfig).toMatchObject({NetworkMode:"none",ReadonlyRootfs:true,CapDrop:["ALL"],
      Mounts:[{Source:VOLUME,Target:"/workspace",ReadOnly:true}]});
    expect(created.Image).toBe(IMAGE);
    expect(created.Cmd[0]).toBe("-I");
    expect(created.Cmd.join(" ")).toContain("O_NOFOLLOW");
    expect(learner.exec).toBeUndefined();
    expect(sidecar.remove).toHaveBeenCalledWith({force:true});
  });
  it("returns incorrect and missing paths without consuming an infrastructure error",async()=>{
    sidecar.logs.mockResolvedValue(Buffer.from('{"ok":true,"failedPaths":["/workspace/project"]}\n'));
    expect(await verifyAdminFilesystem(checked())).toEqual({passed:false,failedPaths:["/workspace/project"]});
  });
  it("rejects wrong-topic, standard, ambiguous and unowned sessions",async()=>{
    mocks.getActiveSessionsForActor.mockReturnValue([{...session,labMode:"standard"}]);
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    mocks.getActiveSessionsForActor.mockReturnValue([session,session]);
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    mocks.getActiveSessionsForActor.mockReturnValue([{...session,adminVolumeName:null}]);
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    expect(mocks.createContainer).not.toHaveBeenCalled();
  });
  it("fails closed if an actor receives a session owned by someone else",async()=>{
    mocks.getActiveSessionsForActor.mockReturnValue([{...session,ownerKey:"other-actor"}]);
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    expect(mocks.getActiveSessionsForActor).toHaveBeenCalledWith("actor");
    expect(mocks.createContainer).not.toHaveBeenCalled();
  });

  it("cannot use another actor key to verify an existing admin session",async()=>{
    await expect(verifyAdminFilesystem({...checked(),actorKey:"other-actor"}))
      .rejects.toThrow("unavailable");
    expect(mocks.getActiveSessionsForActor).toHaveBeenCalledWith("other-actor");
    expect(mocks.createContainer).not.toHaveBeenCalled();
  });

  it("rejects wrong-topic and non-grading session states before creating a sidecar",async()=>{
    mocks.getActiveSessionsForActor.mockReturnValue([
      {...session,adminTopicSlug:"final-capstone-secure-project"},
    ]);
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");

    for (const state of ["starting", "completed", "failed", "canceled", "timed_out"]) {
      mocks.getActiveSessionsForActor.mockReturnValue([{...session,state}]);
      await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    }
    expect(mocks.createContainer).not.toHaveBeenCalled();
  });

  it("permits exactly one matching session even when another topic is active",async()=>{
    mocks.getActiveSessionsForActor.mockReturnValue([
      session,
      {...session,id:"sess-other-topic",adminTopicSlug:"ownership-administration-concepts"},
    ]);
    await expect(verifyAdminFilesystem(checked())).resolves.toEqual({passed:true,failedPaths:[]});
    expect(mocks.createContainer).toHaveBeenCalledTimes(1);
  });

  it("rejects a replaced learner volume or network changes",async()=>{
    learner.inspect.mockResolvedValueOnce(learnerInspect({Mounts:[{
      Destination:"/workspace",Type:"volume",Name:"unrelated",RW:true}],
    }));
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    learner.inspect.mockResolvedValueOnce(learnerInspect({HostConfig:{NetworkMode:"bridge"}}));
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    expect(mocks.createContainer).not.toHaveBeenCalled();
  });
  it("rejects verifier privilege drift, invalid responses and nonzero exit",async()=>{
    sidecar.inspect.mockResolvedValueOnce({HostConfig:{NetworkMode:"bridge"}});
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    sidecar.logs.mockResolvedValueOnce(Buffer.from('{"ok":true,"failedPaths":["/etc/shadow"]}'));
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    sidecar.wait.mockResolvedValueOnce({StatusCode:1});
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
    expect(sidecar.remove).toHaveBeenCalledTimes(3);
  });
  it("refuses verifier results if the runtime switch was turned OFF",async()=>{
    mocks.assertAdminLabSwitch.mockImplementationOnce(() => 2).mockImplementationOnce(() => 2)
      .mockImplementationOnce(()=>{throw new Error("OFF");});
    await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
  });

  it("emits bounded diagnostics for each trust boundary without leaking actor, topic, or path",async()=>{
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const run = async(stage:string) => {
      warn.mockClear();
      await expect(verifyAdminFilesystem(checked())).rejects.toThrow("unavailable");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("RUNNER_ADMIN_FILESYSTEM_UNAVAILABLE", {stage});
      const messages = JSON.stringify(warn.mock.calls);
      expect(messages).not.toContain("actor");
      expect(messages).not.toContain("sudo-root-concepts");
      expect(messages).not.toContain("/workspace/project");
      expect(messages).not.toContain(SESSION_ID);
      expect(messages).not.toContain(VOLUME);
    };
    try {
      mocks.getActiveSessionsForActor.mockReturnValue([]);
      await run("session_match");
      mocks.getActiveSessionsForActor.mockReturnValue([session]);
      mocks.verifyAdminWorkspaceVolume.mockRejectedValueOnce(new Error("private-volume-detail"));
      await run("workspace_attestation");
      learner.inspect.mockRejectedValueOnce(new Error("private-container-detail"));
      await run("learner_inspect");
      learner.inspect.mockResolvedValueOnce(learnerInspect({HostConfig:{NetworkMode:"bridge"}}));
      await run("learner_attestation");
      mocks.createContainer.mockRejectedValueOnce(new Error("private-docker-detail"));
      await run("sidecar_create");
      sidecar.inspect.mockResolvedValueOnce({HostConfig:{NetworkMode:"bridge"}});
      await run("sidecar_attestation");
      sidecar.start.mockRejectedValueOnce(new Error("private-start-detail"));
      await run("sidecar_start");
      sidecar.wait.mockResolvedValueOnce({StatusCode:1});
      await run("sidecar_exit_nonzero");
      sidecar.logs.mockResolvedValueOnce(Buffer.from('{bad-json'));
      await run("sidecar_response");
      sidecar.remove.mockRejectedValueOnce(new Error("private-cleanup-detail"));
      await run("sidecar_cleanup");
    } finally {
      warn.mockRestore();
    }
  });

  it("does not log a failure stage for a legitimate filesystem FAIL",async()=>{
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      sidecar.logs.mockResolvedValueOnce(Buffer.from('{"ok":true,"failedPaths":["/workspace/project"]}'));
      await expect(verifyAdminFilesystem(checked())).resolves.toEqual({passed:false,failedPaths:["/workspace/project"]});
      expect(warn).not.toHaveBeenCalledWith("RUNNER_ADMIN_FILESYSTEM_UNAVAILABLE", expect.anything());
    } finally {
      warn.mockRestore();
    }
  });
});
