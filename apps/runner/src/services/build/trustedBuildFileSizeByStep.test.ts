import { describe, expect, it } from "vitest";
import { trustedBuildFileWriteLimitBytes, resolveSandboxProfile } from "../execution/sandboxProfile.js";
import { buildProductionBuildContainerOptions } from "./executeProductionBuild.js";

function isolatedOptions(step: "install" | "build") {
  return buildProductionBuildContainerOptions({
    workspaceDir: "/workspaces/operator-scope",
    command: step === "install"
      ? ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"]
      : ["pnpm", "build"],
    step,
  });
}

const MiB = 1024 * 1024;

describe("trusted install per-file limit policy", () => {
  it("allows 256 MiB only for fixed trusted installs, retaining 64 MiB for compilation", () => {
    expect(trustedBuildFileWriteLimitBytes("install")).toBe(256 * MiB);
    expect(trustedBuildFileWriteLimitBytes("build")).toBe(64 * MiB);
    expect(resolveSandboxProfile("build").maxFileWriteBytes).toBe(64 * MiB);
    expect(() => trustedBuildFileWriteLimitBytes("preview" as never)).toThrow();
  });

  it("passes each fixed ceiling through the existing Runtime command environment", () => {
    const install = isolatedOptions("install");
    const build = isolatedOptions("build");
    expect(install.Env).toContain(`RUNNER_MAX_FILE_WRITE_BYTES=${256 * MiB}`);
    expect(build.Env).toContain(`RUNNER_MAX_FILE_WRITE_BYTES=${64 * MiB}`);
    expect(install.HostConfig.NetworkMode).toBe("bridge");
    expect(build.HostConfig.NetworkMode).toBe("none");
  });

  it("does not alter Docker isolation, memory admission, scratch tmpfs, or Learning limits", () => {
    const install = isolatedOptions("install");
    const build = isolatedOptions("build");
    const learn = resolveSandboxProfile("learn");
    expect(learn.maxFileWriteBytes).toBeLessThan(64 * MiB);
    for (const candidate of [install, build]) {
      expect(candidate.HostConfig).toMatchObject({
        ReadonlyRootfs: true,
        Privileged: false,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
      });
      expect(candidate.HostConfig.Tmpfs["/tmp"]).toBe("rw,noexec,nosuid,size=256m");
      expect(candidate.HostConfig.Memory).toBe(resolveSandboxProfile("build").memoryBytes);
      expect(candidate.HostConfig.Binds).toEqual(["/workspaces/operator-scope:/workspace:rw"]);
      expect(candidate.User).not.toBe("0:0");
    }
  });
});
