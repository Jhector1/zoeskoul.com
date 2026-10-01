/**
 * Browser/API wire values for gamification award sources.
 * Server persistence maps the same strings to its persistence enum.
 */
export type GamificationAwardSourceType =
  | "answer_correct"
  | "answer_retry_correct"
  | "session_complete"
  | "topic_complete"
  | "module_complete"
  | "streak_bonus"
  | "daily_goal"
  | "daily_five_complete"
  | "public_challenge_complete"
  | "assignment_complete"
  | "project_step";

export type GamificationSummary = {
  totalXp: number;
  rankedXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  xpIntoLevel: number;
  xpForNextLevel: number | null;
  levelProgressPct: number;
};

export type GamificationAwardEvent = {
  sourceType: GamificationAwardSourceType;
  xpDelta: number;
  rankedXpDelta: number;
  reason: string;
};

export type GamificationApplyResult = {
  xpGained: number;
  rankedXpGained: number;
  leveledUp: boolean;
  streakExtended: boolean;
  awarded: GamificationAwardEvent[];
  summary: GamificationSummary;
};

export type ValidateGamificationResult = GamificationApplyResult;
export type ReviewProgressGamificationResult = GamificationApplyResult;
