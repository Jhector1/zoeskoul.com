"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const QUIZ_AUTO_ADVANCE_STORAGE_KEY = "learnoir.quiz.autoAdvance";
export const QUIZ_AUTO_ADVANCE_DELAY_MS = 220;

export function readQuizAutoAdvancePreference(defaultValue = true) {
  if (typeof window === "undefined") return defaultValue;

  try {
    const value = window.localStorage.getItem(QUIZ_AUTO_ADVANCE_STORAGE_KEY);
    if (value == null) return defaultValue;
    return value === "1" || value === "true";
  } catch {
    return defaultValue;
  }
}

export function writeQuizAutoAdvancePreference(enabled: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      QUIZ_AUTO_ADVANCE_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // Storage can be unavailable in private/restricted browsing. The in-memory
    // preference still works for the mounted experience.
  }
}

/**
 * Shared preference used by Review quizzes and the standalone Review-style
 * practice/assignment shells. Keeping this in one hook prevents each product
 * experience from inventing a separate auto-advance setting.
 */
export function useQuizAutoAdvancePreference(defaultValue = true) {
  const [enabled, setEnabledState] = useState(defaultValue);

  useEffect(() => {
    setEnabledState(readQuizAutoAdvancePreference(defaultValue));
  }, [defaultValue]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== QUIZ_AUTO_ADVANCE_STORAGE_KEY) return;
      setEnabledState(readQuizAutoAdvancePreference(defaultValue));
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [defaultValue]);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeQuizAutoAdvancePreference(next);
  }, []);

  return [enabled, setEnabled] as const;
}

type AutoAdvanceHandler = (actionKey: string) => void | Promise<void>;

/**
 * Sequence-agnostic auto-advance controller.
 *
 * Callers own the definition of "resolved" and navigation. Review QuizBlock
 * and standalone practice both use this controller, so timer behavior and the
 * persisted preference cannot drift apart.
 */
export function useQuizAutoAdvanceController(args: {
  actionKey: string | null;
  resolved: boolean;
  enabled: boolean;
  delayMs?: number;
  onAdvance: AutoAdvanceHandler;
  onManualAdvanceRequired?: AutoAdvanceHandler;
  onConsumed?: AutoAdvanceHandler;
}) {
  const timerRef = useRef<number | null>(null);
  const scheduledKeyRef = useRef<string | null>(null);
  const onAdvanceRef = useRef(args.onAdvance);
  const onManualRef = useRef(args.onManualAdvanceRequired);
  const onConsumedRef = useRef(args.onConsumed);

  onAdvanceRef.current = args.onAdvance;
  onManualRef.current = args.onManualAdvanceRequired;
  onConsumedRef.current = args.onConsumed;

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      scheduledKeyRef.current = null;
    };

    const actionKey = args.actionKey;

    if (!actionKey) {
      clearTimer();
      return;
    }

    if (!args.resolved || scheduledKeyRef.current === actionKey) return;

    clearTimer();

    if (!args.enabled) {
      void onManualRef.current?.(actionKey);
      void onConsumedRef.current?.(actionKey);
      return;
    }

    scheduledKeyRef.current = actionKey;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      scheduledKeyRef.current = null;
      void Promise.resolve()
        .then(() => onAdvanceRef.current(actionKey))
        .catch(() => undefined)
        .finally(() => {
          void onConsumedRef.current?.(actionKey);
        });
    }, args.delayMs ?? QUIZ_AUTO_ADVANCE_DELAY_MS);

    return clearTimer;
  }, [args.actionKey, args.delayMs, args.enabled, args.resolved]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);
}
