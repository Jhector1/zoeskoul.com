"use client";

import { useCallback } from "react";
import type { ExcusablePracticeItem } from "@zoeskoul/learner-ui/lib/flow/excuse";
import {
  excusePracticeItem,
  isExcusedPracticeItem,
} from "@zoeskoul/learner-ui/lib/flow/excuse";

export function usePracticeExcuseActions<TItem extends ExcusablePracticeItem>(args: {
  current: TItem | null;
  idx: number;
  setStack: (updater: (prev: TItem[]) => TItem[]) => void;
  goNext: () => Promise<void>;
  loadNextExercise: () => Promise<void>;
  actionErr: string | null;
  setActionErr: (value: string | null) => void;
}) {
  const {
    current,
    idx,
    setStack,
    goNext,
    loadNextExercise,
    actionErr,
    setActionErr,
  } = args;

  const excuseCurrent = useCallback(
    (reason?: string | null) => {
      if (!current) return;

      setStack((prev) => {
        if (idx < 0 || idx >= prev.length) return prev;

        const item = prev[idx];
        if (!item) return prev;

        if (
          isExcusedPracticeItem(item) ||
          item.submitted
        ) {
          return prev;
        }

        const next = prev.slice();
        next[idx] = excusePracticeItem(
          item,
          reason ?? null,
        );
        return next;
      });
    },
    [current, idx, setStack],
  );

  const excuseAndNext = useCallback(
    async (reason?: string | null) => {
      setActionErr(null);
      excuseCurrent(
        reason ?? actionErr ?? "Unknown error",
      );
      await goNext();
    },
    [
      excuseCurrent,
      goNext,
      actionErr,
      setActionErr,
    ],
  );

  const skipLoadError = useCallback(async () => {
    await loadNextExercise();
  }, [loadNextExercise]);

  return {
    excuseCurrent,
    excuseAndNext,
    skipLoadError,
  };
}
