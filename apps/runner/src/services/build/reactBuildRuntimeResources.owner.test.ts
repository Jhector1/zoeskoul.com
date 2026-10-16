import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { resolveSandboxProfile } from "../execution/sandboxProfile.js";

const runtimeDockerfile = readFileSync(
  fileURLToPath(new URL("../../../runtime/Dockerfile", import.meta.url)),
  "utf8",
);

describe("React/Vite trusted runtime resources", () => {
  it("bakes the pinned pnpm executable into the runtime image", () => {
    expect(runtimeDockerfile).toContain(
      "npm install --global --ignore-scripts pnpm@10.33.0",
    );
    expect(runtimeDockerfile).toContain("command -v pnpm");
    expect(runtimeDockerfile).toContain("pnpm --version");
  });

  it("keeps learner and bootstrap tmpfs tight while giving React builds enough package-manager scratch space", () => {
    const learn = resolveSandboxProfile("learn");
    const bootstrap = resolveSandboxProfile("build-bootstrap");
    const build = resolveSandboxProfile("build");

    expect(learn.tmpfs["/tmp"]).toBe("rw,noexec,nosuid,size=64m");
    expect(bootstrap.tmpfs["/tmp"]).toBe("rw,noexec,nosuid,size=64m");
    expect(build.tmpfs["/tmp"]).toBe("rw,noexec,nosuid,size=256m");
  });

  it("keeps the production profile hardened", () => {
    const build = resolveSandboxProfile("build");

    expect(build.readonlyRootfs).toBe(true);
    expect(build.capDrop).toEqual(["ALL"]);
    expect(build.securityOpt).toEqual(["no-new-privileges:true"]);
    expect(build.user).not.toBe("0:0");
  });
});
