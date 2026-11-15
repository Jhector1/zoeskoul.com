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
  CAPSTONE_INITIAL_MODES, capstoneSeedContainerOptions, seedAdminCapstoneWorkspace,
} from "./adminCapstoneWorkspaceSeed.js";

const sessionId = "sess_11111111-1111-4111-8111-111111111111";
const volumeName = `zoeskoul-admin-ws-${sessionId}`;
const image = `sha256:${"a".repeat(64)}`;
const args = {sessionId, volumeName, image, generation: 1};

function fixture(exitCode = 0) {
  const container = {
    start: vi.fn(async () => undefined),
    wait: vi.fn(async () => ({StatusCode: exitCode})),
    remove: vi.fn(async () => undefined),
  };
  const client = {createContainer: vi.fn(async () => container)} as unknown as Docker;
  return {client, container};
}

beforeEach(() => {vi.clearAllMocks(); checks.switch.mockReturnValue(1);});

describe("author-only Course 2 capstone automatic fixture", () => {
  it("seeds seven training targets with deliberately imperfect initial ownership/modes", () => {
    const settings = capstoneSeedContainerOptions(args);
    expect(Object.keys(CAPSTONE_INITIAL_MODES)).toHaveLength(7);
    expect(CAPSTONE_INITIAL_MODES["secure-project/README.md"]).toBe("644:1000:1000");
    expect(CAPSTONE_INITIAL_MODES["secure-project/secrets.env"]).toBe("644:1000:1000");
    const script = settings.Cmd[3];
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

  it("sets exact modes before changing ownership with CAP_FOWNER absent", () => {
    const settings = capstoneSeedContainerOptions(args);
    const script = settings.Cmd[3];
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

  it("checks runtime gate and exact volume both before and after setup", async () => {
    const {client, container} = fixture();
    await seedAdminCapstoneWorkspace(args, client);
    expect(checks.volume).toHaveBeenCalledTimes(2);
    expect(checks.volume).toHaveBeenCalledWith(volumeName, sessionId);
    expect(checks.switch).toHaveBeenCalled();
    expect(container.start).toHaveBeenCalledOnce();
    expect(container.wait).toHaveBeenCalledOnce();
    expect(container.remove).toHaveBeenCalledWith({force:true});
  });

  it("fails closed on a nonzero initializer exit and cleans the seeder", async () => {
    const {client, container} = fixture(1);
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow(/setup failed/);
    expect(container.remove).toHaveBeenCalledWith({force:true});
    expect(checks.volume).toHaveBeenCalledTimes(1);
  });

  it("does not create a seeder when the operator switch is OFF", async () => {
    const {client} = fixture();
    checks.switch.mockImplementationOnce(() => {throw new Error("OFF");});
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow("OFF");
    expect(client.createContainer).not.toHaveBeenCalled();
  });

  it("fails closed on unsuccessful cleanup rather than returning a ready session", async () => {
    const {client,container} = fixture();
    container.remove.mockRejectedValueOnce(new Error("remove failed"));
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow(/cleanup/);
  });

  it("stops if the switch turns OFF while the initializer runs", async () => {
    const {client,container} = fixture();
    checks.switch.mockImplementationOnce(()=>1).mockImplementationOnce(()=>1)
      .mockImplementationOnce(()=>1).mockImplementationOnce(()=>{throw new Error("OFF");});
    await expect(seedAdminCapstoneWorkspace(args, client)).rejects.toThrow("OFF");
    expect(container.remove).toHaveBeenCalledWith({force:true});
  });
});
