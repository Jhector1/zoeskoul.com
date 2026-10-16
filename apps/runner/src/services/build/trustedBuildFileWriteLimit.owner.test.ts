import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveSandboxProfile } from "../execution/sandboxProfile.js";

const repo = process.cwd();

function read(relative: string) {
  return readFileSync(resolve(repo, relative), "utf8");
}

describe("trusted React build file-write ceiling", () => {
  it("owns a build-specific 64 MiB ceiling in the sandbox profile", () => {
    const learn = resolveSandboxProfile("learn");
    const bootstrap = resolveSandboxProfile("build-bootstrap");
    const build = resolveSandboxProfile("build");

    expect(build.maxFileWriteBytes).toBe(67108864);
    expect(bootstrap.maxFileWriteBytes).toBe(learn.maxFileWriteBytes);
    expect(build.maxFileWriteBytes).toBeGreaterThan(bootstrap.maxFileWriteBytes);
  });

  it("passes the runner-owned ceiling to every shared trusted React container", () => {
    const source = read("src/services/build/executeProductionBuild.ts");

    expect(source).toContain(
      "`RUNNER_MAX_FILE_WRITE_BYTES=${profile.maxFileWriteBytes}`",
    );
    expect(source).toContain("trustedRuntimeCommandEnv(args.command)");
    expect(source).not.toContain("req.body");
  });

  it("preserves the proven 256 MiB build scratch tmpfs and sandbox hardening", () => {
    const build = resolveSandboxProfile("build");

    expect(build.tmpfs["/tmp"]).toBe("rw,noexec,nosuid,size=256m");
    expect(build.readonlyRootfs).toBe(true);
    expect(build.capDrop).toEqual(["ALL"]);
    expect(build.securityOpt).toEqual(["no-new-privileges:true"]);
    expect(build.user).not.toBe("0:0");
  });
});
