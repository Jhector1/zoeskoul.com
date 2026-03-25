// src/components/review/quiz/hooks/useQuizLocalAnswers.ts
import { useCallback, useState } from "react";
import type { SavedQuizState } from "@/lib/subjects/progressTypes";

export function useQuizLocalAnswers() {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [checkedById, setCheckedById] = useState<Record<string, boolean>>({});

  const hydrate = useCallback((init: SavedQuizState | null | undefined) => {
    setAnswers(init?.answers ?? {});
    setCheckedById(init?.checkedById ?? {});
  }, []);

  const check = useCallback((qid: string) => {
    setCheckedById((prev) => ({ ...prev, [qid]: true }));
  }, []);

  const setAnswer = useCallback((qid: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }, []);

  const reset = useCallback(() => {
    setAnswers({});
    setCheckedById({});
  }, []);

  return { answers, checkedById, hydrate, check, setAnswer, reset };
}
