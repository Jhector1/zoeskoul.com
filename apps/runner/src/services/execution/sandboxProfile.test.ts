import { describe, expect, it } from "vitest";
import { resolveSandboxProfile } from "./sandboxProfile.js";

describe("sandbox profile", () => {
  it("preserves the learning sandbox security boundary", () => {
    const profile = resolveSandboxProfile("learn");
    expect(profile.readonlyRootfs).toBe(true);
    expect(profile.capDrop).toEqual(["ALL"]);
    expect(profile.securityOpt).toEqual(["no-new-privileges:true"]);
    expect(profile.user).not.toBe("0:0");
  });

  it("provides a dedicated restricted dependency-lock bootstrap profile", () => {
    const profile = resolveSandboxProfile("build-bootstrap");

    expect(profile.id).toBe("build-dependency-lock-bootstrap-v1");
    expect(profile.networkMode).toBe("bridge");
    expect(profile.readonlyRootfs).toBe(true);
    expect(profile.capDrop).toEqual(["ALL"]);
    expect(profile.securityOpt).toEqual(["no-new-privileges:true"]);
    expect(profile.user).not.toBe("0:0");
    expect(profile.memoryBytes).toBeLessThanOrEqual(384 * 1024 * 1024);
    expect(profile.cpuQuota).toBeLessThanOrEqual(100000);
    expect(profile.pidsLimit).toBeLessThanOrEqual(96);
  });

  it("fails closed for build execution until its profile exists", () => {
    expect(() => resolveSandboxProfile("build")).toThrow(
      "Build sandbox profile is not configured.",
    );
  });
});
