import { describe, expect, it } from "vitest";

import {
  getPracticeExperienceRuntimePolicy,
  getPracticeRuntimeSurfacePolicy,
  isPracticeExperienceAllowedOnSurface,
  resolvePracticeSurfaceMode,
  shouldResumePracticeFromServer,
} from "./routePolicy";

describe("practice runtime surface policy", () => {
  it("lets the shared module route render subscriber practice and assignments", () => {
    expect(
      getPracticeRuntimeSurfacePolicy("module_practice").allowedModes,
    ).toEqual(["practice", "standard", "assignment"]);
  });

  it("keeps daily and trial routes narrowly owned", () => {
    expect(
      isPracticeExperienceAllowedOnSurface({
        surface: "daily_practice",
        mode: "assignment",
      }),
    ).toBe(false);
    expect(
      isPracticeExperienceAllowedOnSurface({
        surface: "trial_practice",
        mode: "public_challenge",
      }),
    ).toBe(true);
  });


  it("keeps presentation and resume behavior in the same mode registry", () => {
    expect(getPracticeExperienceRuntimePolicy("assignment")).toEqual({
      workspace: "embedded",
      resumeFromServer: true,
    });
    expect(getPracticeExperienceRuntimePolicy("standard")).toEqual({
      workspace: "tools",
      resumeFromServer: true,
    });
    expect(shouldResumePracticeFromServer("daily_five")).toBe(false);
  });

  it("uses persisted run metadata instead of a stale assignment query hint", () => {
    expect(
      resolvePracticeSurfaceMode({
        surface: "module_practice",
        runMode: "standard",
        requestedAssignment: true,
      }),
    ).toBe("standard");
  });

  it("uses an assignment hint only while the module run is still loading", () => {
    expect(
      resolvePracticeSurfaceMode({
        surface: "module_practice",
        requestedAssignment: true,
      }),
    ).toBe("assignment");
  });
});
