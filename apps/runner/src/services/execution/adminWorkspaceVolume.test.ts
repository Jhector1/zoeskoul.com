import {describe, expect, it, vi, beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({createVolume:vi.fn(),getVolume:vi.fn(),listVolumes:vi.fn()}));
vi.mock("../docker/dockerClient.js",()=>({docker:mocks}));
import {
  adminWorkspaceVolumeName,adminVolumeLabels,createAdminWorkspaceVolume,
  validateAdminVolumeInspect,removeAdminWorkspaceVolume,cleanupOrphanedAdminWorkspaceVolumes,
} from "./adminWorkspaceVolume.js";
const id="sess_11111111-1111-4111-8111-111111111111";
const name=adminWorkspaceVolumeName(id);
const info=()=>({Name:name,Driver:"local",Options:{type:"tmpfs",device:"tmpfs",o:"size=16m,mode=1777"},Labels:adminVolumeLabels(id)});
const handle={inspect:vi.fn(),remove:vi.fn()};
beforeEach(()=>{
  vi.clearAllMocks();
  handle.inspect.mockResolvedValue(info());
  handle.remove.mockResolvedValue(undefined);
  mocks.getVolume.mockReturnValue(handle);
  mocks.createVolume.mockResolvedValue({name});
  mocks.listVolumes.mockResolvedValue({Volumes:[]});
});
describe("per-admin-session memory-backed workspace",()=>{
  it("creates only the approved 16 MiB tmpfs-backed named volume",async()=>{
    expect(await createAdminWorkspaceVolume(id)).toBe(name);
    expect(mocks.createVolume.mock.calls[0][0]).toMatchObject({
      Name:name,Driver:"local",DriverOpts:{type:"tmpfs",device:"tmpfs",o:"size=16m,mode=1777"},
    });
    expect(mocks.createVolume.mock.calls[0][0]).not.toHaveProperty("Binds");
  });
  it("rejects wrong IDs, disk-backed options and missing session labels",()=>{
    expect(()=>adminWorkspaceVolumeName("../../../other")).toThrow();
    expect(()=>validateAdminVolumeInspect({...info(),Options:{type:"none",device:"disk",o:""}},id)).toThrow();
    expect(()=>validateAdminVolumeInspect({...info(),Labels:{}},id)).toThrow();
  });
  it("removes only the session-bound volume after verification",async()=>{
    await removeAdminWorkspaceVolume(name,id);
    expect(handle.remove).toHaveBeenCalledOnce();
    await expect(removeAdminWorkspaceVolume("unrelated",id)).rejects.toThrow();
  });
  it("reaps only labeled administrator volumes and independently verifies absence",async()=>{
    const client={
      listVolumes:vi.fn().mockResolvedValueOnce({Volumes:[info()]}).mockResolvedValueOnce({Volumes:[]}),
      getVolume:vi.fn().mockReturnValue(handle),
    };
    await cleanupOrphanedAdminWorkspaceVolumes(client as any);
    expect(handle.remove).toHaveBeenCalledOnce();
    client.listVolumes.mockReset().mockResolvedValue({Volumes:[info()]});
    await expect(cleanupOrphanedAdminWorkspaceVolumes(client as any)).rejects.toThrow("incomplete");
  });
});
