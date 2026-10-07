"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  getAiTutorRuntimeStatus,
  subscribeAiTutorRuntimeStatus,
} from "@zoeskoul/learner-ui/ai-tutor/tutorAvailability";

export function useAiTutorRuntimeStatus(
  exerciseKey: string | null | undefined,
) {
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeAiTutorRuntimeStatus(exerciseKey, listener),
    [exerciseKey],
  );
  const getSnapshot = useCallback(
    () => getAiTutorRuntimeStatus(exerciseKey),
    [exerciseKey],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
