import type { PracticeExperienceMode } from "./types";

export type EmbeddedPracticeExperienceMode = Extract<
  PracticeExperienceMode,
  "assignment" | "onboarding_trial"
>;

export type EmbeddedPracticeWorkspacePresentation = {
  mode: EmbeddedPracticeExperienceMode;
  testId: "assignment-review-workspace" | "onboarding-trial-review-workspace";
  copy: {
    title: "assignment.title" | "titles.trial";
    kicker: "assignment.kicker" | "badges.trial";
    returnLabel: "assignment.returnToReview" | "onboardingTrial.returnLabel";
    returnTitle: "assignment.returnTitle" | "onboardingTrial.returnTitle";
    returnLoading: "assignment.returnLoading" | "onboardingTrial.returnLoading";
    completeTitle: "assignment.completeTitle" | "onboardingTrial.completeTitle";
    completeSubtitle:
      | "assignment.completeSubtitle"
      | "onboardingTrial.completeSubtitle";
  };
};

const PRESENTATION_BY_MODE: Record<
  EmbeddedPracticeExperienceMode,
  EmbeddedPracticeWorkspacePresentation
> = {
  assignment: {
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
  },
  onboarding_trial: {
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
  },
};

/**
 * Assignment and onboarding trial intentionally share the same compact review
 * workspace. Product behavior remains mode-owned elsewhere: question purpose,
 * attempts, reveal, completion, rewards, and return targets are not flattened
 * into presentation policy.
 */
export function resolveEmbeddedPracticeWorkspacePresentation(
  mode: PracticeExperienceMode,
): EmbeddedPracticeWorkspacePresentation | null {
  if (mode !== "assignment" && mode !== "onboarding_trial") return null;
  return PRESENTATION_BY_MODE[mode];
}
