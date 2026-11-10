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
});
