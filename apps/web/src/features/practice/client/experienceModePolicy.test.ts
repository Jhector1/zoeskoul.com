import { describe, expect, it } from "vitest";

import { resolveClientPracticeExperienceMode } from "./experienceModePolicy";

describe("client practice experience mode", () => {
  it("uses route intent while authoritative run metadata is loading", () => {
    expect(
      resolveClientPracticeExperienceMode({
        requestedAssignment: false,
        expectedExperienceMode: "onboarding_trial",
      }),
    ).toBe("onboarding_trial");
  });

  it("lets persisted run metadata replace the bootstrap route intent", () => {
    expect(
      resolveClientPracticeExperienceMode({
        requestedAssignment: false,
        runMode: "public_challenge",
        expectedExperienceMode: "onboarding_trial",
      }),
    ).toBe("public_challenge");
  });

  it("keeps explicit assignment route intent highest during bootstrap", () => {
    expect(
      resolveClientPracticeExperienceMode({
        requestedAssignment: true,
        runMode: "standard",
      }),
    ).toBe("assignment");
  });
});
