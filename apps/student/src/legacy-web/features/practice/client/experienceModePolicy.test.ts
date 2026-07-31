import { describe, expect, it } from "vitest";

import {
  resolveClientPracticeExperienceMode,
  resolvePracticePurposeDefaults,
} from "./experienceModePolicy";

describe("client practice experience mode", () => {
  it("uses route intent while authoritative run metadata is loading", () => {
    expect(
      resolveClientPracticeExperienceMode({
        surface: "trial_practice",
        requestedAssignment: false,
        initialExperienceMode: "onboarding_trial",
      }),
    ).toBe("onboarding_trial");
  });

  it("lets persisted run metadata replace the bootstrap route intent", () => {
    expect(
      resolveClientPracticeExperienceMode({
        surface: "trial_practice",
        requestedAssignment: false,
        runMode: "public_challenge",
        initialExperienceMode: "onboarding_trial",
      }),
    ).toBe("public_challenge");
  });

  it("lets persisted mode replace a stale assignment route hint", () => {
    expect(
      resolveClientPracticeExperienceMode({
        surface: "module_practice",
        requestedAssignment: true,
        runMode: "standard",
      }),
    ).toBe("standard");
  });

  it("uses assignment route intent while module metadata is loading", () => {
    expect(
      resolveClientPracticeExperienceMode({
        surface: "module_practice",
        requestedAssignment: true,
      }),
    ).toBe("assignment");
  });

  it("uses mixed fallback practice for configurable subscriber sessions", () => {
    expect(
      resolvePracticePurposeDefaults({
        experienceMode: "standard",
        isLockedRun: false,
      }),
    ).toEqual({ preferPurpose: "mixed", purposePolicy: "fallback" });
  });

  it("keeps daily practice on authored project exercises", () => {
    expect(
      resolvePracticePurposeDefaults({
        experienceMode: "daily_five",
        requestedPurpose: "mixed",
        requestedPolicy: "fallback",
        isLockedRun: true,
      }),
    ).toEqual({ preferPurpose: "project", purposePolicy: "strict" });
  });

});
