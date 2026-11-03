import { describe, expect, it } from "vitest";
import { buildProductionBuildContainerOptions } from "./executeProductionBuild.js";
import { buildDependencyLockBootstrapContainerOptions } from "./executeDependencyLockBootstrap.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("trusted runtime one-shot contract", () => {
  const args = { workspaceDir: "/tmp/runner-test-workspace", command: ["pnpm", "install", "--frozen-lockfile"] };

  it("enables noninteractive execution for install and compilation", () => {
    for (const step of ["install", "build"] as const) {
      const options = buildProductionBuildContainerOptions({ ...args, step });
      expect(options.Env).toContain("RUNNER_EXEC_MODE=oneshot");
      expect(options.AttachStdin).toBe(false);
      expect(options.Tty).toBe(false);
      expect(options.HostConfig.Privileged).toBe(false);
      expect(options.HostConfig.CapDrop).toContain("ALL");
    }
  });

  it("enables noninteractive execution for dependency-lock bootstrap", () => {
    const options = buildDependencyLockBootstrapContainerOptions(args);
    expect(options.Env).toContain("RUNNER_EXEC_MODE=oneshot");
    expect(options.AttachStdin).toBe(false);
    expect(options.Tty).toBe(false);
  });

  it("does not opt interactive Learning sessions into one-shot mode", () => {
    const source = readFileSync(fileURLToPath(new URL("../docker/startDockerSession.ts", import.meta.url)), "utf8");
    expect(source).not.toContain("RUNNER_EXEC_MODE=oneshot");
    expect(source).toContain("RUN_CMD_JSON=");
  });
});
