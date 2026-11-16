import {beforeEach, describe, expect, it, vi} from "vitest";
import type Docker from "dockerode";

const checks = vi.hoisted(() => ({
  switch: vi.fn(() => 1),
  volume: vi.fn(async () => undefined),
}));
vi.mock("./learningAdminSwitch.js", () => ({assertAdminLabSwitch: checks.switch}));
vi.mock("./adminWorkspaceVolume.js", () => ({
  adminWorkspaceVolumeName: (id: string) => `zoeskoul-admin-ws-${id}`,
  verifyAdminWorkspaceVolume: checks.volume,
}));
vi.mock("../docker/dockerClient.js", () => ({docker: {}}));

import {
  CAPSTONE_INITIAL_MODES, capstoneSeedContainerOptions,
  capstoneHoldContainerOptions, seedAdminCapstoneWorkspace,
} from "./adminCapstoneWorkspaceSeed.js";

const sessionId = "sess_11111111-1111-4111-8111-111111111111";
const volumeName = `zoeskoul-admin-ws-${sessionId}`;
const image = `sha256:${"a".repeat(64)}`;
const args = {sessionId, volumeName, image, generation: 1};

function fixture(exitCode = 0) {
  const steps: string[] = [];
  const holder = {
    start: vi.fn(async () => {steps.push("holder.start");}),
    inspect: vi.fn(async () => ({State: {Running: true}})),
    remove: vi.fn(async () => {steps.push("holder.remove");}),
  };
  const container = {
    start: vi.fn(async () => {steps.push("seeder.start");}),
    wait: vi.fn(async () => {steps.push("seeder.wait"); return {StatusCode: exitCode};}),
    remove: vi.fn(async () => {steps.push("seeder.remove");}),
  };
  const client = {createContainer: vi.fn(async (options: {name: string}) => {
    if (options.name.includes("_hold_")) return holder;
    if (options.name.includes("_seed_")) return container;
    throw new Error("Unexpected container profile");
  })} as unknown as Docker;
  return {client, container, holder, steps};
}

beforeEach(() => {vi.clearAllMocks(); checks.switch.mockReturnValue(1);});

describe("author-only Course 2 capstone automatic fixture", () => {
  it("seeds seven training targets with deliberately imperfect initial ownership/modes", () => {
    const settings = capstoneSeedContainerOptions(args);
    expect(Object.keys(CAPSTONE_INITIAL_MODES)).toHaveLength(7);
    expect(CAPSTONE_INITIAL_MODES["secure-project/README.md"]).toBe("644:1000:1000");
    expect(CAPSTONE_INITIAL_MODES["secure-project/secrets.env"]).toBe("644:1000:1000");
    const script = settings.Cmd[2];
    for (const item of Object.keys(CAPSTONE_INITIAL_MODES)) expect(script).toContain(item);
    expect(script).toContain("PLACEHOLDER=not-a-secret");
    expect(script).toContain("test ! -L");
    expect(script).not.toMatch(/curl|wget|docker\.sock|\/host|chmod -R|rm -rf/);
  });

  it("uses the pinned admin image with only the named tmpfs mount and no network", () => {
    const settings = capstoneSeedContainerOptions(args);
    expect(settings.Image).toBe(image);
    expect(settings.HostConfig.NetworkMode).toBe("none");
    expect(settings.HostConfig.ReadonlyRootfs).toBe(true);
    expect(settings.HostConfig.SecurityOpt).toContain("no-new-privileges");
    expect(settings.HostConfig.CapAdd).toEqual(["CHOWN"]);
    expect(settings.HostConfig.Mounts).toEqual([{Type:"volume",Source:volumeName,
      Target:"/workspace", ReadOnly:false, VolumeOptions:{NoCopy:true}}]);
    expect("Binds" in settings.HostConfig).toBe(false);
  });

  it("bypasses the administrator image init entrypoint only for the disposable seeder", () => {
    const settings = capstoneSeedContainerOptions(args);
    expect(settings.Entrypoint).toEqual(["/bin/sh"]);
    expect(settings.Cmd.slice(0, 2)).toEqual(["-eu", "-c"]);
    expect(settings.Cmd).toHaveLength(3);
    expect(settings.Cmd[2]).toContain("mkdir -m 0755 secure-project");
    expect(settings.Cmd[2]).not.toMatch(/chpasswd|admin-init\.sh/);
    expect(settings.Image).toBe(image);
    expect(settings.HostConfig.ReadonlyRootfs).toBe(true);
    expect(settings.HostConfig.CapDrop).toEqual(["ALL"]);
    expect(settings.HostConfig.CapAdd).toEqual(["CHOWN"]);
  });

  it("creates a passive, restricted holder with the SAME pinned volume", () => {
    const settings = capstoneHoldContainerOptions(args);
    expect(settings.Image).toBe(image);
    expect(settings.Entrypoint).toEqual(["/bin/sh"]);
    expect(settings.Cmd).toEqual(["-c", "exec sleep 600"]);
    expect(settings.User).toBe("1000:1000");
    expect(settings.HostConfig.NetworkMode).toBe("none");
    expect(settings.HostConfig.ReadonlyRootfs).toBe(true);
    expect(settings.HostConfig.CapDrop).toEqual(["ALL"]);
    expect(settings.HostConfig.CapAdd).toEqual([]);
    expect(settings.HostConfig.SecurityOpt).toEqual(["no-new-privileges"]);
    expect(settings.HostConfig.Mounts).toEqual([{
      Type:"volume", Source:volumeName, Target:"/workspace",
      ReadOnly:false, VolumeOptions:{NoCopy:true},
    }]);
    expect("Binds" in settings.HostConfig).toBe(false);
    expect(settings.Labels["com.zoeskoul.runner.profile"]).toBe("learning-admin-capstone-hold-v1");
  });

  it("rejects unverified hold identities before any Docker operation", () => {
    expect(() => capstoneHoldContainerOptions({...args, volumeName:"other"})).toThrow();
    expect(() => capstoneHoldContainerOptions({...args, image:"ubuntu:latest"})).toThrow();
  });

  it("sets exact modes before changing ownership with CAP_FOWNER absent", () => {
    const settings = capstoneSeedContainerOptions(args);
    const script = settings.Cmd[2];
    const chmodDirectories = script.indexOf("chmod 00755 secure-project");
    const chmodFiles = script.indexOf("chmod 0644 secure-project/README.md");
    const chown = script.indexOf("chown 1000:1000 secure-project");
    expect(chmodDirectories).toBeGreaterThan(-1);
    expect(chmodFiles).toBeGreaterThan(chmodDirectories);
    expect(chown).toBeGreaterThan(chmodFiles);
    expect(script.slice(chown)).not.toMatch(/\bchmod\b/);
    expect(settings.HostConfig.CapAdd).toEqual(["CHOWN"]);
    expect(settings.HostConfig.CapAdd).not.toContain("FOWNER");
  });

  it("rejects other volume identities and unpinned images before Docker calls", () => {
    expect(() => capstoneSeedContainerOptions({...args, volumeName:"other"})).toThrow();
    expect(() => capstoneSeedContainerOptions({...args, image:"ubuntu:latest"})).toThrow();
  });

  it("keeps the verified tmpfs mounted from seeding until learner takeover", async () => {
    const {client, container, holder, steps} = fixture();
    const hold = await seedAdminCapstoneWorkspace(args, client);
    expect(checks.volume).toHaveBeenCalledTimes(3);
    expect(checks.volume).toHaveBeenCalledWith(volumeName, sessionId);
    expect(checks.switch).toHaveBeenCalled();
    expect(container.start).toHaveBeenCalledOnce();
    expect(container.wait).toHaveBeenCalledOnce();
    expect(container.remove).toHaveBeenCalledWith({force:true});
    expect(holder.remove).not.toHaveBeenCalled();
    expect(steps).toEqual(["holder.start", "seeder.start", "seeder.wait", "seeder.remove"]);
    await hold.assertMounted();
    await hold.release(); // Caller only does this after learner.start() resolves.
    expect(holder.remove).toHaveBeenCalledWith({force:true});
    expect(steps[steps.length - 1]).toBe("holder.remove");
    await hold.release(); // Idempotent successful cleanup.
    expect(holder.remove).toHaveBeenCalledOnce();
  });

  it("refuses a learner handoff when the holder is no longer running", async () => {
    const {client, holder} = fixture();
    const hold = await seedAdminCapstoneWorkspace(args, client);
    holder.inspect.mockResolvedValueOnce({State:{Running:false}});
    await expect(hold.assertMounted()).rejects.toThrow(/holder stopped/);
    await hold.release();
  });

  it("cleans an unstarted holder when rootless Docker refuses its start", async () => {
    const {client, holder} = fixture();
    holder.start.mockRejectedValueOnce(new Error("rootless start failed"));
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow(/rootless start failed/);
    expect(holder.remove).toHaveBeenCalledWith({force:true});
  });

  it("fails closed when a mounted hold cannot be released", async () => {
    const {client, holder} = fixture();
    const hold = await seedAdminCapstoneWorkspace(args, client);
    holder.remove.mockRejectedValueOnce(new Error("Docker unavailable"));
    await expect(hold.release()).rejects.toThrow(/holder cleanup/);
    await hold.release();
  });

  it("fails closed on a nonzero initializer exit and cleans both containers", async () => {
    const {client, container, holder} = fixture(1);
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow(/setup failed/);
    expect(container.remove).toHaveBeenCalledWith({force:true});
    expect(holder.remove).toHaveBeenCalledWith({force:true});
    expect(checks.volume).toHaveBeenCalledTimes(2);
  });

  it("does not create a seeder when the operator switch is OFF", async () => {
    const {client} = fixture();
    checks.switch.mockImplementationOnce(() => {throw new Error("OFF");});
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow("OFF");
    expect(client.createContainer).not.toHaveBeenCalled();
  });

  it("fails closed on unsuccessful seeder cleanup and removes the holder", async () => {
    const {client, container, holder} = fixture();
    container.remove.mockRejectedValueOnce(new Error("remove failed"));
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow(/cleanup/);
    expect(holder.remove).toHaveBeenCalledWith({force:true});
  });

  it("stops and releases the holder if the switch turns OFF during seeding", async () => {
    const {client, holder} = fixture();
    checks.switch.mockImplementationOnce(()=>1).mockImplementationOnce(()=>1)
      .mockImplementationOnce(()=>1).mockImplementationOnce(()=>{throw new Error("OFF");});
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow("OFF");
    expect(holder.remove).toHaveBeenCalledWith({force:true});
  });
});
