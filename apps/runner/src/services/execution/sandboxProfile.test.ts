import { describe, expect, it } from "vitest";
import { resolveSandboxProfile, resolveSandboxImage } from "./sandboxProfile.js";
import { env } from "../../lib/env.js";

describe("sandbox profile", () => {
  it("uses the dedicated learner image only for learning when configured", () => {
    const shared = "example.invalid/shared-runtime@sha256:shared";
    const learning = "zoeskoul-learning-runtime:stage4b9bf3x";
    expect(resolveSandboxImage("learn", shared, learning)).toBe(learning);
    expect(resolveSandboxImage("learn", shared)).toBe(shared);
    expect(resolveSandboxImage("learn", shared, undefined)).toBe(shared);
  });

  it("never passes the learner-only image to build, bootstrap or preview install", () => {
    const shared = "shared-image";
    const learning = "learner-image";
    for (const purpose of ["build", "build-bootstrap", "build-preview-install"] as const) {
      expect(resolveSandboxImage(purpose, shared, learning)).toBe(shared);
      expect(resolveSandboxImage(purpose, shared)).toBe(shared);
    }
  });

  it("wires current environment image selection without weakening profiles", () => {
    expect(resolveSandboxProfile("learn").image).toBe(
      env.runnerLearningImage ?? env.runnerImage,
    );
    for (const purpose of ["build", "build-bootstrap", "build-preview-install"] as const) {
      const profile = resolveSandboxProfile(purpose);
      expect(profile.image).toBe(env.runnerImage);
      expect(profile.readonlyRootfs).toBe(true);
      expect(profile.capDrop).toEqual(["ALL"]);
      expect(profile.securityOpt).toEqual(["no-new-privileges:true"]);
    }
  });
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
    expect(profile.memoryBytes).toBe(env.bootstrapMemoryLimitBytes);
    expect(profile.memoryBytes).toBeGreaterThanOrEqual(384 * 1024 * 1024);
    expect(profile.memoryBytes).toBeLessThanOrEqual(1024 * 1024 * 1024);
    // Raising trusted bootstrap memory must not raise Learning memory.
    expect(resolveSandboxProfile("learn").memoryBytes).toBe(env.memoryLimitBytes);
    expect(profile.cpuQuota).toBeLessThanOrEqual(100000);
    expect(profile.pidsLimit).toBeLessThanOrEqual(96);
  });

  it("provides a dedicated hardened production-build profile", () => {
    const profile =
      resolveSandboxProfile("build");

    expect(
      profile.id,
    ).toBe(
      "build-production-react-vite-v1",
    );

    expect(
      profile.networkMode,
    ).toBe(
      "bridge",
    );

    expect(
      profile.readonlyRootfs,
    ).toBe(true);

    expect(
      profile.capDrop,
    ).toEqual([
      "ALL",
    ]);

    expect(
      profile.securityOpt,
    ).toEqual([
      "no-new-privileges:true",
    ]);

    expect(
      profile.user,
    ).not.toBe(
      "0:0",
    );

    expect(
      profile.memoryBytes,
    ).toBeGreaterThan(0);

    expect(
      profile.cpuQuota,
    ).toBeGreaterThan(0);

    expect(
      profile.pidsLimit,
    ).toBeGreaterThan(0);
  });
});
