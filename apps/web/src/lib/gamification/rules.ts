import type { PracticeDifficulty } from "@zoeskoul/db";
import type { GamificationAwardSourceType } from "./types";

type AttemptXpInput = {
  ok: boolean;
  isReveal: boolean;
  priorNonRevealAttempts: number;
  difficulty?: PracticeDifficulty | null;
  helpStepKeys?: string[];
};

export type XpRuleResult = {
  sourceType: GamificationAwardSourceType;
  xpDelta: number;
  reason: string;
};

function difficultyBase(difficulty: PracticeDifficulty | null | undefined) {
  if (difficulty === "hard") return 30;
  if (difficulty === "medium") return 20;
  return 10;
}

function helpMultiplier(stepKeys: string[]) {
  if (stepKeys.includes("hint_2")) return 0.4;
  if (stepKeys.includes("hint_1")) return 0.7;
  if (stepKeys.includes("concept")) return 0.85;
  return 1;
}

function attemptMultiplier(priorNonRevealAttempts: number) {
  if (priorNonRevealAttempts <= 0) return 1;
  if (priorNonRevealAttempts === 1) return 0.8;
  return 0.6;
}

export function getAttemptXpRule(input: AttemptXpInput): XpRuleResult | null {
  const {
    ok,
    isReveal,
    priorNonRevealAttempts,
    difficulty,
    helpStepKeys = [],
  } = input;

  if (isReveal || !ok) return null;

  const base = difficultyBase(difficulty);
  const xpDelta = Math.max(
    1,
    Math.round(
      base *
        attemptMultiplier(priorNonRevealAttempts) *
        helpMultiplier(helpStepKeys),
    ),
  );

  const usedHelp = helpStepKeys.some((key) =>
    key === "concept" || key === "hint_1" || key === "hint_2",
  );

  return {
    sourceType:
      priorNonRevealAttempts === 0
        ? "answer_correct"
        : "answer_retry_correct",
    xpDelta,
    reason: [
      `${difficulty ?? "easy"} answer`,
      priorNonRevealAttempts === 0 ? "first attempt" : "after retry",
      usedHelp ? "with hint adjustment" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function getSessionCompleteXpRule(args?: {
  sourceType?: GamificationAwardSourceType;
  xpDelta?: number;
  reason?: string;
}): XpRuleResult {
  return {
    sourceType: args?.sourceType ?? "session_complete",
    xpDelta: args?.xpDelta ?? 20,
    reason: args?.reason ?? "Session complete",
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
