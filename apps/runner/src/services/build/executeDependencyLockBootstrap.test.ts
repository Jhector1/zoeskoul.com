import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildDependencyLockBootstrapContainerOptions } from "./executeDependencyLockBootstrap.js";

describe("restricted Build dependency-lock bootstrap container", () => {
  it("uses the dedicated non-interactive hardened bootstrap sandbox profile", () => {
    const options = buildDependencyLockBootstrapContainerOptions({
      workspaceDir: "/workspaces/zoebuild-test",
      command: [
        "pnpm",
        "install",
        "--lockfile-only",
        "--ignore-scripts",
      ],
    });

    expect(options.Cmd).toEqual([
      "pnpm",
      "install",
      "--lockfile-only",
      "--ignore-scripts",
    ]);
    expect(options.WorkingDir).toBe("/workspace");
    expect(options.AttachStdin).toBe(false);
    expect(options.Tty).toBe(false);
    expect(options.OpenStdin).toBe(false);
    expect(options.Labels["com.zoeskoul.runner.purpose"]).toBe(
      "build-bootstrap",
    );
    expect(options.Labels["com.zoeskoul.runner.profile"]).toBe(
      "build-dependency-lock-bootstrap-v1",
    );

    expect(options.HostConfig).toMatchObject({
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      NetworkMode: "bridge",
    });

    expect(options.HostConfig.Memory).toBeLessThanOrEqual(
      384 * 1024 * 1024,
    );
    expect(options.HostConfig.CpuQuota).toBeLessThanOrEqual(100000);
    expect(options.HostConfig.PidsLimit).toBeLessThanOrEqual(96);
    expect(options.HostConfig.Binds).toEqual([
      "/workspaces/zoebuild-test:/workspace:rw",
    ]);
    expect(options.HostConfig.Binds.join(" ")).not.toContain("docker.sock");
  });

  it("captures only pnpm-lock.yaml and always destroys the temporary workspace", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/services/build/executeDependencyLockBootstrap.ts",
      ),
      "utf8",
    );

    expect(source).toContain('path.join(workspaceDir, "pnpm-lock.yaml")');
    expect(source).toContain('path: "pnpm-lock.yaml"');
    expect(source).toContain("container.remove({ force: true })");
    expect(source).toContain("fs.rm(workspaceDir");
    expect(source).toContain("finally {");
    expect(source).toContain("ensureWorkspaceWritableForShellUser(workspaceDir)");
    expect(source.indexOf("ensureWorkspaceWritableForShellUser(workspaceDir)")).toBeGreaterThan(
      source.indexOf("  try {", source.indexOf("const workspaceDir =")),
    );

    expect(source).not.toContain("/docker.sock");
    expect(source).not.toContain("exec(");
    expect(source).not.toContain("spawn(");
    expect(source).not.toContain("shell:");
  });

  it("revalidates the registered dependency manifest before Docker creation", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/services/build/executeDependencyLockBootstrap.ts",
      ),
      "utf8",
    );

    const policy = source.indexOf("assertRegisteredDependencyBootstrapFiles({");
    const create = source.indexOf(".createContainer(");

    expect(policy).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(policy);
  });

  it("enforces a finite wall timeout for the one-shot package-resolution job", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/services/build/executeDependencyLockBootstrap.ts",
      ),
      "utf8",
    );

    expect(source).toContain("const BOOTSTRAP_TIMEOUT_MS = 120_000");
    expect(source).toContain("Promise.race");
    expect(source).toContain("setTimeout");
  });
});
