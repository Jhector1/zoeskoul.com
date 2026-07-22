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
