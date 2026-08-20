import { describe, expect, it } from "vitest";

import { computePurposeDecision } from "./purpose.policy";

const target = (
  exerciseKey: string,
  exercisePurpose: "quiz" | "project" | "practice",
) => ({
  subjectSlug: "python-v2",
  moduleSlug: "python-v2-1",
  sectionSlug: "section-1",
  topicSlug: "topic-1",
  exerciseKey,
  exerciseTitle: exerciseKey,
  exerciseKind: exercisePurpose === "quiz" ? "single_choice" : "code_input",
  exercisePurpose,
});

describe("practice purpose policy", () => {
  it("keeps Daily Practice on authored practice purpose", () => {
    const decision = computePurposeDecision({
      session: {
        id: "daily-session",
        mode: "daily_five",
        preferPurpose: "practice",
        meta: { kind: "daily_five" },
        section: {
          module: {
            practicePreset: { allowedPurposes: ["quiz", "project"] },
          },
        },
      },
      preferPurposeParam: "practice",
      purposePolicyParam: "strict",
    });

    expect(decision).toMatchObject({
      ok: true,
      effective: "practice",
      allowed: ["practice"],
      source: "session",
      reason: "daily_practice_uses_practice_purpose",
    });
  });

  it("makes normal Practice strict practice purpose", () => {
    const decision = computePurposeDecision({
      session: {
        mode: "standard",
        preferPurpose: "project",
        section: {
          module: {
            practicePreset: { allowedPurposes: ["quiz", "project"] },
          },
        },
      },
      preferPurposeParam: "project",
      purposePolicyParam: "fallback",
    });

    expect(decision).toMatchObject({
      ok: true,
      effective: "practice",
      allowed: ["practice"],
      policy: "strict",
      reason: "practice_modes_use_practice_purpose",
    });
  });

  it("uses practice purpose from a new subscriber authored queue", () => {
    const session = {
      id: "subscriber-session",
      mode: "standard",
      meta: {
        kind: "subscriber_practice",
        targetCount: 2,
        queue: [
          target("practice-1", "practice"),
          target("practice-2", "practice"),
        ],
      },
    };

    expect(
      computePurposeDecision({
        session,
        preferPurposeParam: "practice",
        purposePolicyParam: "strict",
      }),
    ).toMatchObject({
      ok: true,
      effective: "practice",
      allowed: ["practice"],
      reason: "subscriber_practice_uses_authored_queue_purpose",
    });
  });

  it("keeps old subscriber quiz/project queues resumable", () => {
    const session = {
      id: "legacy-subscriber-session",
      mode: "standard",
      meta: {
        kind: "subscriber_practice",
        targetCount: 2,
        queue: [
          target("quiz-1", "quiz"),
          target("project-1", "project"),
        ],
      },
    };

    expect(
      computePurposeDecision({
        session,
        preferPurposeParam: "quiz",
        purposePolicyParam: "strict",
      }),
    ).toMatchObject({
      ok: true,
      effective: "quiz",
      allowed: ["quiz", "project"],
    });

    expect(
      computePurposeDecision({
        session,
        preferPurposeParam: "project",
        purposePolicyParam: "strict",
      }),
    ).toMatchObject({
      ok: true,
      effective: "project",
      allowed: ["quiz", "project"],
    });
  });

  it("forces onboarding trials back to quiz purpose", () => {
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
      preferPurposeParam: "practice",
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
