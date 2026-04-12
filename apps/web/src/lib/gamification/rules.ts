import type { GamificationAwardSourceType } from "./types";

type AttemptXpInput = {
    ok: boolean;
    isReveal: boolean;
    priorNonRevealAttempts: number;
};

export type XpRuleResult = {
    sourceType: GamificationAwardSourceType;
    xpDelta: number;
    reason: string;
};

export function getAttemptXpRule(input: AttemptXpInput): XpRuleResult | null {
    const { ok, isReveal, priorNonRevealAttempts } = input;

    if (isReveal) return null;
    if (!ok) return null;

    if (priorNonRevealAttempts === 0) {
        return {
            sourceType: "answer_correct",
            xpDelta: 10,
            reason: "Correct answer",
        };
    }

    return {
        sourceType: "answer_retry_correct",
        xpDelta: 6,
        reason: "Correct after retry",
    };
}

export function getSessionCompleteXpRule(): XpRuleResult {
    return {
        sourceType: "session_complete",
        xpDelta: 20,
        reason: "Session complete",
    };
}

export function getTopicCompleteXpRule(topicId: string): XpRuleResult {
    return {
        sourceType: "topic_complete",
        xpDelta: 25,
        reason: `Topic complete: ${topicId}`,
    };
}

export function getModuleCompleteXpRule(moduleId: string): XpRuleResult {
    return {
        sourceType: "module_complete",
        xpDelta: 50,
        reason: `Module complete: ${moduleId}`,
    };
}

export function getDailyStreakBonusRule(currentStreak: number): XpRuleResult {
    const cappedStreak = Math.max(1, Math.min(currentStreak, 7));

    return {
        sourceType: "streak_bonus",
        xpDelta: 5 * cappedStreak,
        reason: `Day ${currentStreak} streak bonus`,
    };
}