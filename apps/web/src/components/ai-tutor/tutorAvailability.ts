import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";

const AI_TUTOR_UNLOCKED_PREFIX = "zoeskoul:ai-tutor:unlocked:";

type TutorStorage = Pick<Storage, "getItem" | "setItem">;

function storageKey(exerciseKey: string) {
  return `${AI_TUTOR_UNLOCKED_PREFIX}${exerciseKey}`;
}

export function readAiTutorUnlocked(
  exerciseKey: string | null | undefined,
  storage?: TutorStorage | null,
) {
  if (!exerciseKey || !storage) return false;

  try {
    return storage.getItem(storageKey(exerciseKey)) === "1";
  } catch {
    return false;
  }
}

export function rememberAiTutorUnlocked(
  exerciseKey: string | null | undefined,
  storage?: TutorStorage | null,
) {
  if (!exerciseKey || !storage) return;

  try {
    storage.setItem(storageKey(exerciseKey), "1");
  } catch {
    // Storage can be disabled by the browser. The in-memory unlock still works.
  }
}

export type AiTutorSurface = "hidden" | "offer" | "panel" | "launcher";

export function resolveAiTutorSurface({
  available,
  open,
  offerDismissed,
}: {
  available: boolean;
  open: boolean;
  offerDismissed: boolean;
}): AiTutorSurface {
  if (!available) return "hidden";
  if (open) return "panel";
  if (offerDismissed) return "launcher";
  return "offer";
}


export function resolveAiTutorExerciseKey(
  exercise: Exercise | null | undefined,
  current: QItem | null | undefined,
) {
  return exercise
    ? `${exercise.topic}:${exercise.id}`
    : current?.key ?? null;
}

export type AiTutorRuntimeStatus =
  | "idle"
  | "available"
  | "failed"
  | "unavailable";

const aiTutorRuntimeStatuses = new Map<string, AiTutorRuntimeStatus>();
const aiTutorRuntimeListeners = new Map<string, Set<() => void>>();

export function getAiTutorRuntimeStatus(
  exerciseKey: string | null | undefined,
): AiTutorRuntimeStatus {
  if (!exerciseKey) return "idle";
  return aiTutorRuntimeStatuses.get(exerciseKey) ?? "idle";
}

export function subscribeAiTutorRuntimeStatus(
  exerciseKey: string | null | undefined,
  listener: () => void,
) {
  if (!exerciseKey) return () => {};

  const listeners = aiTutorRuntimeListeners.get(exerciseKey) ?? new Set();
  listeners.add(listener);
  aiTutorRuntimeListeners.set(exerciseKey, listeners);

  return () => {
    const current = aiTutorRuntimeListeners.get(exerciseKey);
    current?.delete(listener);
    if (!current?.size) aiTutorRuntimeListeners.delete(exerciseKey);
  };
}

export function setAiTutorRuntimeStatus(
  exerciseKey: string | null | undefined,
  status: AiTutorRuntimeStatus,
) {
  if (!exerciseKey) return;

  const previous = getAiTutorRuntimeStatus(exerciseKey);
  if (previous === status) return;

  aiTutorRuntimeStatuses.set(exerciseKey, status);
  for (const listener of aiTutorRuntimeListeners.get(exerciseKey) ?? []) {
    listener();
  }
}

export function markAiTutorAvailable(exerciseKey: string | null | undefined) {
  setAiTutorRuntimeStatus(exerciseKey, "available");
}

export function isAiTutorFallbackRequired(
  status: AiTutorRuntimeStatus | null | undefined,
) {
  return status === "failed" || status === "unavailable";
}
