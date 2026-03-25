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
    setQuizLoading(true);
    setQuizError(null);

    (async () => {
      try {
        const reqSpec = { ...(spec as any), quizKey: stableQuizKey } as any;
        const data = await fetchReviewQuiz(reqSpec, ctrl.signal);

        setServerQuizKey(data?.quizKey ?? stableQuizKey);

        const qs = Array.isArray(data?.questions) ? data.questions : [];
        setQuestions(qs);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setQuizError(e?.message ?? "Failed to load quiz.");
          setQuestions([]);
        }
      } finally {
        setQuizLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [quizId, stableQuizKey, reloadNonce, specSnap]);

  return { quizLoading, quizError, questions, serverQuizKey };
}
