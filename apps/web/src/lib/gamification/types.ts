import type { XpSourceType } from "@zoeskoul/db";

export type GamificationAwardSourceType = Extract<
    XpSourceType,
    | "answer_correct"
    | "answer_retry_correct"
    | "session_complete"
    | "topic_complete"
    | "module_complete"
    | "streak_bonus"
>;

export type GamificationSummary = {
    totalXp: number;
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
    reason: string;
};

export type GamificationApplyResult = {
    xpGained: number;
    leveledUp: boolean;
    streakExtended: boolean;
    awarded: GamificationAwardEvent[];
    summary: GamificationSummary;
};

export type ValidateGamificationResult = GamificationApplyResult;
export type ReviewProgressGamificationResult = GamificationApplyResult;
