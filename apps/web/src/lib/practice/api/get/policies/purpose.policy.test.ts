import { describe, expect, it } from "vitest";

import { computePurposeDecision } from "./purpose.policy";

describe("practice purpose policy", () => {
  it("lets a daily queue use a project-purpose standalone try-it even under a quiz-only module preset", () => {
    const decision = computePurposeDecision({
      session: {
        mode: "daily_five",
        preferPurpose: "quiz",
        meta: { kind: "daily_five" },
        section: {
          module: {
            practicePreset: { allowedPurposes: ["quiz"] },
          },
        },
      },
      preferPurposeParam: "project",
      purposePolicyParam: "strict",
    });

    expect(decision).toMatchObject({
      ok: true,
      effective: "project",
      allowed: ["project"],
      source: "session",
      reason: "practice_modes_use_project_purpose",
    });
  });

  it("forces subscriber practice to project purpose even under a quiz-only module preset", () => {
    const decision = computePurposeDecision({
      session: {
        mode: "standard",
        preferPurpose: "quiz",
        section: {
          module: {
            practicePreset: { allowedPurposes: ["quiz"] },
          },
        },
      },
      preferPurposeParam: "project",
      purposePolicyParam: "strict",
    });

    expect(decision).toMatchObject({
      ok: true,
      effective: "project",
      allowed: ["project"],
      reason: "practice_modes_use_project_purpose",
    });
  });

  it("forces onboarding trials back to quiz purpose even when stale client or session state says project", () => {
    const decision = computePurposeDecision({
      session: {
        id: "trial-session",
        mode: "onboarding_trial",
        preferPurpose: "project",
        meta: { kind: "onboarding_trial" },
        section: {
          module: {
            practicePreset: { allowedPurposes: ["quiz", "project"] },
          },
        },
      },
      preferPurposeParam: "project",
      purposePolicyParam: "strict",
    });

    expect(decision).toMatchObject({
      ok: true,
      effective: "quiz",
      allowed: ["quiz"],
      policy: "strict",
      source: "session",
      reason: "onboarding_trial_uses_quiz_purpose",
    });
  });
});
