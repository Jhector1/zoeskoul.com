import { describe, expect, it } from "vitest";
import { env } from "../../lib/env.js";
import { resolveSandboxProfile } from "../execution/sandboxProfile.js";
import {
  buildProductionBuildContainerOptions,
  resolveTrustedBuildStepResources,
} from "./executeProductionBuild.js";

const root = "/workspaces/trusted-preview-test";
const command = ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"] as const;
const preview = { workspaceDir: root, command, step: "install" as const,
  resourceContext: "tanstack-preview-install" as const };
const standard = { workspaceDir: root, command, step: "install" as const };

describe("P3B7J dedicated trusted preview install budgets", () => {
  it("uses only the preview installer memory budget and a hard swap ceiling", () => {
    const options = buildProductionBuildContainerOptions(preview);
    const build = buildProductionBuildContainerOptions(standard);
    expect(options.Labels["com.zoeskoul.runner.profile"]).toBe("build-preview-install-v1");
    expect(options.HostConfig.Memory).toBe(env.previewInstallMemoryLimitBytes);
    expect(options.HostConfig.MemorySwap).toBe(options.HostConfig.Memory);
    expect(options.HostConfig.NetworkMode).toBe("bridge");
    expect(options.HostConfig.ReadonlyRootfs).toBe(true);
    expect(options.HostConfig.CapDrop).toEqual(["ALL"]);
    expect(options.HostConfig.SecurityOpt).toEqual(["no-new-privileges:true"]);
    expect(options.HostConfig.Privileged).toBe(false);
    expect(options.HostConfig.PidsLimit).toBe(build.HostConfig.PidsLimit);
    expect(options.HostConfig.CpuQuota).toBe(build.HostConfig.CpuQuota);
    expect(options.HostConfig.Binds).toEqual([`${root}:/workspace:rw`]);
    expect(options.User).not.toBe("0:0");
    expect(options.Cmd).toEqual(command);
    expect(options.HostConfig.Memory).toBeGreaterThanOrEqual(384 * 1024 * 1024);
    expect(options.HostConfig.Memory).toBeLessThanOrEqual(1024 * 1024 * 1024);
  });

  it("does not change bootstrap, production compilation, or Learning", () => {
    const compilation = buildProductionBuildContainerOptions({
      workspaceDir: root, command: ["pnpm", "exec", "vite", "build"], step: "build",
    });
    expect(compilation.HostConfig.NetworkMode).toBe("none");
    expect(compilation.HostConfig.Memory).toBe(env.buildMemoryLimitBytes);
    expect(compilation.Labels["com.zoeskoul.runner.profile"]).toBe(
      resolveSandboxProfile("build").id,
    );
    expect(buildProductionBuildContainerOptions(standard).HostConfig.Memory).toBe(
      env.buildMemoryLimitBytes,
    );
    expect(resolveSandboxProfile("learn").memoryBytes).toBe(env.memoryLimitBytes);
    expect(resolveSandboxProfile("build-bootstrap").memoryBytes).toBe(env.bootstrapMemoryLimitBytes);
  });

  it("separates the preview install deadline from normal build deadlines", () => {
    expect(resolveTrustedBuildStepResources(preview).timeoutMs).toBe(env.previewInstallTimeoutMs);
    expect(resolveTrustedBuildStepResources(standard).timeoutMs).toBe(env.buildStepTimeoutMs);
    expect(resolveTrustedBuildStepResources({step:"build"}).timeoutMs).toBe(env.buildStepTimeoutMs);
    expect(env.previewInstallTimeoutMs).toBeGreaterThanOrEqual(180_000);
    expect(env.previewInstallTimeoutMs).toBeLessThanOrEqual(600_000);
  });

  it("rejects using preview install permissions for compilation or unknown contexts", () => {
    expect(() => buildProductionBuildContainerOptions({
      workspaceDir: root, command: ["pnpm", "build"], step: "build",
      resourceContext: "tanstack-preview-install",
    })).toThrow("only run trusted install");
    expect(() => resolveTrustedBuildStepResources({
      step:"install", resourceContext:"arbitrary" as never,
    })).toThrow("Unsupported trusted build resource context");
  });
});
