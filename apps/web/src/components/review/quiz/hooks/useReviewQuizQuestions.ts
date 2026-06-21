// src/components/review/quiz/hooks/useReviewQuizQuestions.ts
import { useEffect, useState } from "react";
import type { ReviewQuestion, ReviewQuizSpec } from "@/lib/subjects/types";
import { fetchReviewQuiz } from "@/lib/subjects/clientApi";

export function useReviewQuizQuestions(args: {
  quizId: string;
  spec: ReviewQuizSpec;
  stableQuizKey: string;
  reloadNonce: number;
}) {
  const { quizId, spec, stableQuizKey, reloadNonce } = args;

  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [serverQuizKey, setServerQuizKey] = useState(stableQuizKey);
const specSnap = JSON.stringify(spec);

  useEffect(() => {
    const ctrl = new AbortController();
    let didTimeout = false;
    let disposed = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      ctrl.abort();
    }, 20000);

    setQuizLoading(true);
    setQuizError(null);
    setQuestions([]);

    (async () => {
      try {
        const reqSpec = { ...(spec as any), quizKey: stableQuizKey } as any;
        const data = await fetchReviewQuiz(reqSpec, ctrl.signal);
        if (disposed) return;

        setServerQuizKey(data?.quizKey ?? stableQuizKey);

        const qs = Array.isArray(data?.questions) ? data.questions : [];
        setQuestions(qs);
      } catch (e: any) {
        if (disposed) return;

        if (didTimeout) {
          setQuizError(
            "The quiz/exercise took too long to load. Please refresh this card, and check the /api/review/quiz server log if it happens again.",
          );
          setQuestions([]);
          return;
        }

        if (e?.name !== "AbortError") {
          setQuizError(e?.message ?? "Failed to load quiz.");
          setQuestions([]);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!disposed) setQuizLoading(false);
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
      ctrl.abort();
    };
  }, [quizId, stableQuizKey, reloadNonce, specSnap]);

  return { quizLoading, quizError, questions, serverQuizKey };
}
