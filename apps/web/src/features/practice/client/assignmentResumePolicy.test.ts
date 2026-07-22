import { describe, expect, it } from "vitest";

import {
  buildServerResumePlan,
  resolvePracticeResumePolicy,
} from "./assignmentResumePolicy";

describe("resolvePracticeResumePolicy", () => {
  it("makes assignment resume server-backed and mode-locked", () => {
    expect(
      resolvePracticeResumePolicy({
        experienceMode: "assignment",
        requestedPersistence: "session",
      }),
    ).toEqual({
      clientStatePersistence: "off",
      expectedExperienceMode: "assignment",
      resumeHistoryOnBoot: true,
    });
  });

  it("makes subscriber practice resume from server history", () => {
    expect(
      resolvePracticeResumePolicy({
        experienceMode: "standard",
        requestedPersistence: "session",
      }),
    ).toEqual({
      clientStatePersistence: "off",
      expectedExperienceMode: "standard",
      resumeHistoryOnBoot: true,
    });
  });

  it("honors an expected subscriber mode before run metadata arrives", () => {
    expect(
      resolvePracticeResumePolicy({
        experienceMode: "practice",
        requestedPersistence: "session",
        expectedExperienceMode: "standard",
      }),
    ).toEqual({
      clientStatePersistence: "off",
      expectedExperienceMode: "standard",
      resumeHistoryOnBoot: true,
    });
  });

  it("preserves non-server-backed persistence policy", () => {
    expect(
      resolvePracticeResumePolicy({
        experienceMode: "daily_five",
        requestedPersistence: "off",
        expectedExperienceMode: "daily_five",
      }),
    ).toEqual({
      clientStatePersistence: "off",
      expectedExperienceMode: "daily_five",
      resumeHistoryOnBoot: false,
    });
  });
});

describe("buildServerResumePlan", () => {
  it("seeds answered questions before loading the next unanswered question", () => {
    const plan = buildServerResumePlan({
      enabled: true,
      complete: false,
      localStack: [],
      history: ["q1", "q2", "q3", "q4"],
    });

    expect(plan.seedStack).toEqual(["q1", "q2", "q3", "q4"]);
    expect(plan.shouldLoadCurrent).toBe(true);
    expect(plan.nextQuestionIndex).toBe(4);
  });

  it("does not replace an already hydrated local stack", () => {
    const plan = buildServerResumePlan({
      enabled: true,
      complete: false,
      localStack: ["q1", "q2", "q3", "q4", "q5"],
      history: ["q1", "q2", "q3", "q4"],
    });

    expect(plan.seedStack).toBeNull();
    expect(plan.shouldLoadCurrent).toBe(false);
    expect(plan.nextQuestionIndex).toBe(4);
  });
});
