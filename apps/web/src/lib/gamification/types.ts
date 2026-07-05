import type { XpSourceType } from "@zoeskoul/db";

export type GamificationAwardSourceType = XpSourceType;

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
