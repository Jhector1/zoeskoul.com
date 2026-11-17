import { describe,expect,it } from "vitest";
import { adminHostConfig, adminLabFileWriteLimitBytes, verifyAdminSandboxImage } from "./learningAdminSandbox.js";
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


describe("root lab apt file-size limit without ordinary learner quota changes", () => {
  const standardLimit = 262144 + 8 * 1024 * 1024;
  it("retains the current per-file cap for regular learner shells", () => {
    expect(adminLabFileWriteLimitBytes("standard", standardLimit)).toBe(standardLimit);
  });
  it("allows the Ubuntu universe package index in disposable admin labs only", () => {
    const adminLimit = adminLabFileWriteLimitBytes("admin", standardLimit);
    expect(adminLimit).toBe(64 * 1024 * 1024);
    expect(adminLimit).toBeGreaterThan(20 * 1024 * 1024);
  });
});
