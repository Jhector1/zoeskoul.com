import type { Difficulty, TopicSlug } from "@/lib/practice/types";

/**
 * Stable product experiences. These are product-level intents, not always a
 * one-to-one mirror of PracticeSession.mode. In particular, a review-module
 * assignment is stored as mode="standard" with module_assignment metadata
 * because it has no Assignment row/assignmentId.
 *
 * `practice` is the only non-persisted experience.
 */
export type PracticeExperienceMode =
  | "practice"
  | "standard"
  | "daily_five"
  | "onboarding_trial"
  | "public_challenge"
  | "assignment";

export type PracticeViewerTier = "guest" | "free" | "subscriber";

export type PracticeExperienceFilters = {
  topicEditable: boolean;
  difficultyEditable: boolean;
  purposeEditable: boolean;
  countEditable: boolean;
};

export type PracticeExperienceEligibility = {
  allowedKinds: string[] | null;
  allowedPurposes: Array<"quiz" | "project"> | null;
  allowMultiFile: boolean;
  allowTerminal: boolean;
};

export type PracticeExperienceRewards = {
  learningXp: boolean;
  rankedXp: boolean;
  rankedDailyCap: number | null;
};

export type PracticeExperiencePolicy = {
  mode: PracticeExperienceMode;
  label: string;
  targetCount: number | null;
  maxAttempts: number | null;
  allowReveal: boolean;
  lockDifficulty: Difficulty | null;
  lockTopic: "all" | TopicSlug | null;
  filters: PracticeExperienceFilters;
  eligibility: PracticeExperienceEligibility;
  rewards: PracticeExperienceRewards;
};

export type PracticeRunViewer = {
  tier: PracticeViewerTier;
  authenticated: boolean;
  subscribed: boolean;
};
