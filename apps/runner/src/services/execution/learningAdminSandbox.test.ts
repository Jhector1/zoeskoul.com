import { describe,expect,it } from "vitest";
import { adminHostConfig, verifyAdminSandboxImage } from "./learningAdminSandbox.js";
describe("rootless admin sandbox boundary",()=>{
  it("never shares host directories or networking",()=>{
    expect(adminHostConfig.NetworkMode).toBe("none");
    expect(adminHostConfig).not.toHaveProperty("Binds");
    expect(adminHostConfig).not.toHaveProperty("Mounts");
    expect(adminHostConfig.CapDrop).toContain("ALL");
    expect(adminHostConfig.Tmpfs).not.toHaveProperty("/workspace");
    expect(adminHostConfig.Tmpfs).toHaveProperty("/tmp");
    expect(adminHostConfig.PidsLimit).toBeLessThanOrEqual(48);
  });
  it("rejects non-rootless execution",async()=>{
    const client={info:async()=>({SecurityOptions:["name=seccomp"],DockerRootDir:"/var/lib/docker"}),getImage:()=>({inspect:async()=>({})})};
    await expect(verifyAdminSandboxImage(client as any,"sha256:"+"a".repeat(64))).rejects.toThrow(/rootless/);
  });
  it("accepts only images carrying the approved purpose label",async()=>{
    const id="sha256:"+"a".repeat(64);
    const client={info:async()=>({SecurityOptions:["name=rootless"],DockerRootDir:"/home/test/.local/share/docker"}),getImage:()=>({inspect:async()=>({Id:id,Config:{Labels:{}}})})};
    await expect(verifyAdminSandboxImage(client as any,id)).rejects.toThrow(/Untrusted/);
  });
});
