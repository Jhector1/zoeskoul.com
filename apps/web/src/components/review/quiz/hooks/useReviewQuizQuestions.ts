// src/components/review/quiz/hooks/useReviewQuizQuestions.ts
import { useEffect, useMemo, useState } from "react";
import type { ReviewQuestion, ReviewQuizSpec } from "@/lib/subjects/types";
import { fetchReviewQuiz } from "@/lib/subjects/clientApi";


type ProjectStepLike = {
  id?: unknown;
  title?: unknown;
  topic?: unknown;
  difficulty?: unknown;
  preferKind?: unknown;
  exerciseKey?: unknown;
  seedPolicy?: unknown;
  maxAttempts?: unknown;
  carryFromPrev?: unknown;
};

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function buildLocalProjectQuestions(args: {
  spec: ReviewQuizSpec;
  stableQuizKey: string;
}): ReviewQuestion[] | null {
  const specAny = args.spec as ReviewQuizSpec & {
    mode?: unknown;
    steps?: ProjectStepLike[];
    moduleSlug?: string;
    section?: string;
    difficulty?: "easy" | "medium" | "hard";
    maxAttempts?: number | null;
  };

  if (specAny.mode !== "project") return null;
  const steps = Array.isArray(specAny.steps) ? specAny.steps : [];
  if (!steps.length) return null;

  const subject = asNonEmptyString(specAny.subject);
  const moduleSlug = asNonEmptyString(specAny.moduleSlug ?? specAny.module);
  if (!subject || !moduleSlug) return null;

  return steps.map((step, index) => {
    const stepId = asNonEmptyString(step?.id) || `step-${index + 1}`;
    const topic = asNonEmptyString(step?.topic ?? specAny.topic);
    const exerciseKey = asNonEmptyString(step?.exerciseKey);
    const preferKind = (step?.preferKind ?? specAny.preferKind ?? null) as any;
    const difficulty = (step?.difficulty ?? specAny.difficulty ?? "easy") as any;
    const seedPolicy = asNonEmptyString(step?.seedPolicy) || "global";

    return {
      kind: "practice" as const,
      id: `proj:${stepId}:local:${index + 1}`,
      title: typeof step?.title === "string" ? step.title : `Step ${index + 1}`,
      stepId,
      sourceStepId: stepId,
      exerciseKey: exerciseKey || stepId,
      projectStepManifest: step,
      carryFromPrev: Boolean(step?.carryFromPrev),
      fetch: {
        subject,
        module: moduleSlug,
        section: specAny.section,
        topic,
        difficulty,
        allowReveal: Boolean(specAny.allowReveal),
        preferPurpose: "project",
        preferKind,
        ...(exerciseKey ? { exerciseKey } : {}),
        stepId,
        seedPolicy: seedPolicy === "actor" ? "actor" : "global",
        salt: `${args.stableQuizKey}|step=${stepId}|slot=${index + 1}`,
      } as any,
      maxAttempts:
        step?.maxAttempts !== undefined
          ? (step.maxAttempts as any)
          : specAny.maxAttempts !== undefined
            ? (specAny.maxAttempts as any)
            : null,
    } as ReviewQuestion;
  });
}

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

const localProjectQuestions = useMemo(

  () => buildLocalProjectQuestions({ spec, stableQuizKey }),

  [specSnap, stableQuizKey],

);

  useEffect(() => {
    if (localProjectQuestions) {
      setQuizLoading(false);
      setQuizError(null);
      setQuestions(localProjectQuestions);
      setServerQuizKey(stableQuizKey);
      return;
    }

    const ctrl = new AbortController();
    let didTimeout = false;
    let disposed = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      ctrl.abort();
    }, 90000);

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
            "The quiz/exercise request did not finish. Retry this card after the server is ready.",
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
  }, [quizId, stableQuizKey, reloadNonce, specSnap, localProjectQuestions]);

  return { quizLoading, quizError, questions, serverQuizKey };
}
