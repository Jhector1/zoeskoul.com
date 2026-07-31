import type { CardStateKey, ExerciseStateKey } from "./reviewRuntimeTypes";

export type ExerciseKeyContext = {
  subjectSlug?: string | null;
  moduleSlug?: string | null;
  sectionSlug?: string | null;
  topicId?: string | null;
  cardId?: string | null;
};

function cleanKeyPart(value: string | null | undefined) {
  const text = typeof value === "string" && value.trim() ? value.trim() : "unknown";
  return text.replace(/[:\s]+/g, "-");
}

export function getCardStateKey(ctx: ExerciseKeyContext): CardStateKey {
  return [
    cleanKeyPart(ctx.subjectSlug),
    cleanKeyPart(ctx.moduleSlug),
    cleanKeyPart(ctx.sectionSlug),
    cleanKeyPart(ctx.topicId),
    cleanKeyPart(ctx.cardId),
  ].join(":");
}

export function getCardToolScopeKey(cardKey: string): string {
  const normalized = typeof cardKey === "string" ? cardKey.trim() : "";
  return `card:${normalized || "unknown"}`;
}

/**
 * Accept both the canonical card:<full-card-key> scope and the historical
 * <full-card-key>:general scope while existing progress records migrate.
 */
export function getCardStateKeyFromToolScopeKey(toolScopeKey: string): string {
  const raw = typeof toolScopeKey === "string" ? toolScopeKey.trim() : "";
  if (raw.startsWith("card:")) return raw.replace(/^card:/, "");
  if (raw.endsWith(":general")) return raw.replace(/:general$/, "");
  return raw;
}

export function getCardIdFromToolScopeKey(toolScopeKey: string): string {
  const cardStateKey = getCardStateKeyFromToolScopeKey(toolScopeKey);
  const parts = cardStateKey.split(":").filter(Boolean);
  return parts[parts.length - 1] || cardStateKey;
}

export function getExerciseStateKey(
  ctx: ExerciseKeyContext,
  exerciseId: string,
): ExerciseStateKey {
  return `${getCardStateKey(ctx)}:${cleanKeyPart(exerciseId)}`;
}
