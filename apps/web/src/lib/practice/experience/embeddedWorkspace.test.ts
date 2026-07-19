import { describe, expect, it } from "vitest";

import { resolveEmbeddedPracticeWorkspacePresentation } from "./embeddedWorkspace";

describe("embedded practice workspace presentation", () => {
  it("shares one workspace family without erasing assignment identity", () => {
    expect(resolveEmbeddedPracticeWorkspacePresentation("assignment")).toEqual({
      mode: "assignment",
      testId: "assignment-review-workspace",
      copy: {
        title: "assignment.title",
        kicker: "assignment.kicker",
        returnLabel: "assignment.returnToReview",
        returnTitle: "assignment.returnTitle",
        returnLoading: "assignment.returnLoading",
        completeTitle: "assignment.completeTitle",
        completeSubtitle: "assignment.completeSubtitle",
      },
    });
  });

  it("keeps onboarding copy and test identity separate on the shared layout", () => {
    expect(
      resolveEmbeddedPracticeWorkspacePresentation("onboarding_trial"),
    ).toEqual({
      mode: "onboarding_trial",
      testId: "onboarding-trial-review-workspace",
      copy: {
        title: "titles.trial",
        kicker: "badges.trial",
        returnLabel: "onboardingTrial.returnLabel",
        returnTitle: "onboardingTrial.returnTitle",
        returnLoading: "onboardingTrial.returnLoading",
        completeTitle: "onboardingTrial.completeTitle",
        completeSubtitle: "onboardingTrial.completeSubtitle",
      },
    });
  });

  it("does not pull full-workspace practice modes into the embedded shell", () => {
    expect(resolveEmbeddedPracticeWorkspacePresentation("practice")).toBeNull();
    expect(resolveEmbeddedPracticeWorkspacePresentation("standard")).toBeNull();
    expect(resolveEmbeddedPracticeWorkspacePresentation("daily_five")).toBeNull();
    expect(resolveEmbeddedPracticeWorkspacePresentation("public_challenge")).toBeNull();
  });
});
