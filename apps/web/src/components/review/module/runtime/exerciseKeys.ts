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

export function getExerciseStateKey(
  ctx: ExerciseKeyContext,
  exerciseId: string,
): ExerciseStateKey {
  return `${getCardStateKey(ctx)}:${cleanKeyPart(exerciseId)}`;
}
