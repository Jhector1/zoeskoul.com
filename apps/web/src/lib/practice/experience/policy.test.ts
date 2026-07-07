import { describe, expect, it } from "vitest";

import { getPracticeExperiencePolicy } from "./policy";

describe("practice experience policy", () => {
  it("keeps teacher assignments author controlled", () => {
    const policy = getPracticeExperiencePolicy({
      mode: "assignment",
      difficulty: "hard",
      assignmentAllowReveal: false,
      assignmentQuestionMaxAttempts: 2,
      targetCount: 8,
    });

    expect(policy).toMatchObject({
      mode: "assignment",
      targetCount: 8,
      maxAttempts: 2,
      allowReveal: false,
      lockDifficulty: "hard",
      eligibility: {
        allowedPurposes: ["quiz"],
        allowMultiFile: false,
        allowTerminal: false,
      },
      rewards: { rankedXp: false },
    });
  });

  it("keeps public challenges exact and separate from onboarding", () => {
    const challenge = getPracticeExperiencePolicy({
      mode: "public_challenge",
      viewerTier: "free",
    });
    const onboarding = getPracticeExperiencePolicy({
      mode: "onboarding_trial",
      viewerTier: "guest",
    });

    expect(challenge.targetCount).toBe(1);
    expect(challenge.maxAttempts).toBeNull();
    expect(challenge.allowReveal).toBe(true);
    expect(challenge.rewards.learningXp).toBe(true);
    expect(challenge.rewards.rankedXp).toBe(false);

    expect(onboarding.targetCount).toBe(3);
    expect(onboarding.rewards.learningXp).toBe(false);
    expect(onboarding.rewards.rankedXp).toBe(false);
  });

  it("makes only daily practice ranked and subscriber practice configurable", () => {
    const daily = getPracticeExperiencePolicy({
      mode: "daily_five",
      targetCount: 3,
    });
    const subscriber = getPracticeExperiencePolicy({
      mode: "standard",
      viewerTier: "subscriber",
    });

    expect(daily).toMatchObject({
      targetCount: 3,
      maxAttempts: null,
      eligibility: {
        allowedKinds: ["code_input"],
        allowedPurposes: ["project"],
        allowMultiFile: false,
        allowTerminal: false,
      },
      rewards: { rankedXp: true, rankedDailyCap: 3 },
    });
    expect(subscriber.filters).toEqual({
      topicEditable: true,
      difficultyEditable: true,
      purposeEditable: false,
      countEditable: true,
    });
  });
});
