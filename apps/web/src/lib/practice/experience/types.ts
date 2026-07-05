import type { Difficulty, TopicSlug } from "@/lib/practice/types";

/**
 * Stable product experiences. Keep these names aligned with
 * PracticeSessionMode in the Prisma schema.
 *
 * `practice` is the only non-persisted mode. Every other value represents a
 * persisted PracticeSession and must be written explicitly at creation time.
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
