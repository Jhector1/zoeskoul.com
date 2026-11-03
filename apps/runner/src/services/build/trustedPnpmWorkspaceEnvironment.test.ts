import { describe, expect, it } from "vitest";
import { buildProductionBuildContainerOptions } from "./executeProductionBuild.js";
import { buildDependencyLockBootstrapContainerOptions } from "./executeDependencyLockBootstrap.js";
import { TRUSTED_PNPM_STORE_DIR, trustedPnpmWorkspaceEnvironment } from "./trustedPnpmWorkspaceEnvironment.js";

describe("P3B3 trusted pnpm workspace store", () => {
  it("uses a single fixed disk-backed path and version-compatible config", () => {
    expect(TRUSTED_PNPM_STORE_DIR).toBe("/workspace/.zoebuild-runtime/pnpm-store");
    expect(trustedPnpmWorkspaceEnvironment()).toContain(`npm_config_store_dir=${TRUSTED_PNPM_STORE_DIR}`);
    expect(trustedPnpmWorkspaceEnvironment()).toContain(`pnpm_config_store_dir=${TRUSTED_PNPM_STORE_DIR}`);
    for (const entry of trustedPnpmWorkspaceEnvironment()) {
      expect(entry).not.toContain("=/tmp/");
    }
  });

  it("shares the policy between install, build, and dependency bootstrap", () => {
    const args = { workspaceDir: "/workspaces/isolated-project", command: ["pnpm", "install", "--ignore-scripts"] } as const;
    const install = buildProductionBuildContainerOptions({ ...args, step: "install" });
    const build = buildProductionBuildContainerOptions({ ...args, step: "build" });
    const bootstrap = buildDependencyLockBootstrapContainerOptions(args);
    for (const options of [install, build, bootstrap]) {
      expect(options.Env).toEqual(expect.arrayContaining([...trustedPnpmWorkspaceEnvironment()]));
      expect(options.Env).toContain("HOME=/tmp");
      expect(options.Env).toContain("RUNNER_EXEC_MODE=oneshot");
      expect(options.HostConfig.Binds).toEqual(["/workspaces/isolated-project:/workspace:rw"]);
      expect(options.HostConfig.ReadonlyRootfs).toBe(true);
      expect(options.HostConfig.CapDrop).toEqual(["ALL"]);
      expect(options.HostConfig.SecurityOpt).toEqual(["no-new-privileges:true"]);
      expect(options.AttachStdin).toBe(false);
      expect(options.Tty).toBe(false);
    }
  });

  it("preserves separate network policies and tmpfs capacity", () => {
    const args = { workspaceDir: "/workspaces/isolated-project", command: ["pnpm", "install"] } as const;
    const install = buildProductionBuildContainerOptions({ ...args, step: "install" });
    const build = buildProductionBuildContainerOptions({ ...args, step: "build" });
    const bootstrap = buildDependencyLockBootstrapContainerOptions(args);
    expect(install.HostConfig.NetworkMode).toBe("bridge");
    expect(build.HostConfig.NetworkMode).toBe("none");
    expect(bootstrap.HostConfig.NetworkMode).toBe("bridge");
    expect(install.HostConfig.Tmpfs["/tmp"]).toContain("size=256m");
    expect(build.HostConfig.Tmpfs["/tmp"]).toContain("size=256m");
    // Keep the existing, smaller bootstrap tmpfs policy unchanged.
    expect(bootstrap.HostConfig.Tmpfs["/tmp"]).toContain("size=64m");
  });
});
