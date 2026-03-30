"use client";

import React, { useEffect, useMemo, useRef } from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import type { CodeLanguage, Exercise } from "@/lib/practice/types";
import type { VectorPadState } from "@/components/vectorpad/types";
import { defaultVectorPadState } from "@/components/vectorpad/defaultState";
import ExerciseRenderer from "./ExerciseRenderer";
import type { QItem } from "./practiceType";
import SingleChoiceExerciseUI from "./kinds/SingleChoiceExerciseUI";
import MultiChoiceExerciseUI from "./kinds/MultiChoiceExerciseUI";
import CodeInputExerciseUI from "./kinds/CodeInputExerciseUI";
import { buildCorrectItemFromExpected } from "@/features/practice/client/usePracticeEngine";
import { useTranslations } from "next-intl";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { useTaggedT } from "@/i18n/tagged";

function normalizeMath(md: string) {
  const s = String(md ?? "");
  const ttWrapped = s.replace(
      /\\\(\s*\\texttt\{([\s\S]*?)\}\s*\\\)/g,
      (_m, inner) => `\`${String(inner).trim()}\``,
  );
  const tt = ttWrapped.replace(
      /\\texttt\{([\s\S]*?)\}/g,
      (_m, inner) => `\`${String(inner).trim()}\``,
  );
  const inline = tt.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${String(inner).trim()}$`);
  const display = inline.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$$\n${String(inner).trim()}\n$$`);
  return display;
}

type Tone = "neutral" | "good" | "danger" | "info";

function statusFor(q: QItem): {
  key: "revealed" | "correct" | "incorrect" | "unchecked";
  tone: Tone;
} {
  if ((q as any).revealed) return { key: "revealed", tone: "info" };
  if (q.result?.ok === true) return { key: "correct", tone: "good" };
  if (q.result) return { key: "incorrect", tone: "danger" };
  return { key: "unchecked", tone: "neutral" };
}

function pillClass(tone: Tone) {
  if (tone === "good") return "ui-pill-good";
  if (tone === "danger") return "ui-pill-danger";
  if (tone === "info") return "ui-pill-info";
  return "ui-pill-neutral";
}

function extractExpected(result: any) {
  return result?.expected ?? result?.revealAnswer ?? result?.reveal ?? result?.solution ?? null;
}

function ReadOnlyPracticeCard({
                                q,
                                index,
                                maxAttempts,
                                isLockedRun,
                              }: {
  q: QItem;
  index: number;
  maxAttempts: number;
  isLockedRun: boolean;
}) {
  const t = useTranslations("PracticeReviewList");
  const { raw } = useTaggedT();

  const exerciseRaw = q.exercise as Exercise | undefined;

  const exercise = useMemo(() => {
    if (!exerciseRaw) return null;
    return resolveDeepTagged(exerciseRaw, (key) => String(raw(key, ""))) as Exercise;
  }, [exerciseRaw, raw]);

  const padRef = useRef<{ current: VectorPadState }>({
    current: defaultVectorPadState(),
  });

  useEffect(() => {
    const pr = padRef.current.current;
    if (!pr) return;
    pr.mode = "2d";
    if ((q as any).dragA) pr.a = { ...(q as any).dragA } as any;
    if ((q as any).dragB) pr.b = { ...(q as any).dragB } as any;
  }, [q]);

  const st = statusFor(q);
  const explanation = (q.result as any)?.explanation ?? null;
  const expected = extractExpected(q.result);

  const checked = Boolean(q.submitted) || Boolean(q.result) || Boolean((q as any).revealed);
  const ok = q.result?.ok ?? null;

  const correctItem = useMemo(() => {
    if (ok !== false) return null;
    if (!expected) return null;
    return buildCorrectItemFromExpected(q, expected);
  }, [q, expected, ok]);

  const reviewSingleCorrectId = useMemo(() => {
    const id = (correctItem as any)?.single;
    return typeof id === "string" && id.length ? id : null;
  }, [correctItem]);

  const reviewMultiCorrectIds = useMemo(() => {
    const ids = (correctItem as any)?.multi;
    return Array.isArray(ids) && ids.length ? ids.map((x: any) => String(x)) : null;
  }, [correctItem]);

  const reviewCodeCorrect = useMemo(() => {
    const ci: any = correctItem as any;
    if (!ci) return null;

    const code = typeof ci.code === "string" ? ci.code : null;
    if (!code) return null;

    const language = (ci.codeLang ?? (q as any).codeLang) as CodeLanguage;
    const stdin =
        typeof ci.codeStdin === "string" ? ci.codeStdin : ((q as any).codeStdin ?? "");
    return { language, code, stdin };
  }, [correctItem, q]);

  const currentForReview = useMemo<QItem>(() => {
    return { ...q, submitted: checked ? true : Boolean(q.submitted) };
  }, [q, checked]);

  if (!exercise) return null;

  const showHiddenNote = ok === false && !expected;

  const statusLabel =
      st.key === "revealed"
          ? t("status.revealed", { fallback: "Revealed" } as any)
          : st.key === "correct"
              ? t("status.correct", { fallback: "Correct" } as any)
              : st.key === "incorrect"
                  ? t("status.incorrect", { fallback: "Not correct" } as any)
                  : t("status.unchecked", { fallback: "Not checked" } as any);

  return (
      <article className="ui-page-surface overflow-hidden p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="ui-kicker">
              {t("questionLabel", { n: index + 1, fallback: `Question ${index + 1}` } as any)}
              {typeof (exercise as any).topic !== "undefined" ? (
                  <> • {String((exercise as any).topic).toUpperCase()}</>
              ) : null}
              <> • {String(exercise.kind).replaceAll("_", " ")}</>
            </div>

            {exercise.title ? (
                <div className="mt-1 line-clamp-2 ui-title-sm sm:text-[15px]">
                  {String(exercise.title)}
                </div>
            ) : null}
          </div>

          <div className={pillClass(st.tone)}>{statusLabel}</div>
        </div>

        <div className="mt-3">
          {exercise.kind === "single_choice" ? (
              <SingleChoiceExerciseUI
                  exercise={exercise}
                  value={(q as any).single}
                  onChange={() => {}}
                  disabled={true}
                  checked={checked}
                  ok={ok}
                  reviewCorrectId={reviewSingleCorrectId}
              />
          ) : exercise.kind === "multi_choice" ? (
              <MultiChoiceExerciseUI
                  exercise={exercise}
                  value={Array.isArray((q as any).multi) ? (q as any).multi : []}
                  onChange={() => {}}
                  disabled={true}
                  checked={checked}
                  ok={ok}
                  reviewCorrectIds={reviewMultiCorrectIds}
              />
          ) : exercise.kind === "code_input" ? (
              <CodeInputExerciseUI
                  exercise={exercise as any}
                  code={(q as any).code ?? ""}
                  stdin={(q as any).codeStdin ?? ""}
                  language={(((q as any).codeLang ?? "python") as CodeLanguage)}
                  onChangeCode={() => {}}
                  onChangeStdin={() => {}}
                  onChangeLanguage={() => {}}
                  disabled={true}
                  checked={checked}
                  ok={ok}
                  readOnly={true}
                  reviewCorrect={reviewCodeCorrect}
              />
          ) : (
              <ExerciseRenderer
                  exercise={exercise}
                  current={currentForReview}
                  busy={false}
                  isAssignmentRun={false}
                  maxAttempts={maxAttempts}
                  padRef={padRef.current as any}
                  updateCurrent={() => {}}
                  showPrompt={false}
                  readOnly
              />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium">
          <span className="ui-pill-neutral">
            {t("attemptsLabel", { fallback: "Attempts:" } as any)}{" "}
            <span className="text-[rgb(var(--ui-text)/0.96)]">
              {(q as any).attempts ?? 0}/{isLockedRun ? maxAttempts : "∞"}
            </span>
          </span>

            {ok === true ? (
                <span className="ui-pill-good">✓ Correct</span>
            ) : (q as any).result ? (
                <span className="ui-pill-danger">✕ Not correct</span>
            ) : (
                <span className="ui-pill-neutral">
              {t("mini.unchecked", { fallback: "Not checked yet" } as any)}
            </span>
            )}
          </div>

          {showHiddenNote ? (
              <div className="ui-surface-muted mt-3 px-3 py-2 text-[11px] font-medium text-[rgb(var(--ui-text-muted)/0.9)]">
                {t("hiddenCorrect", { fallback: "Correct answer is hidden for this run." } as any)}
              </div>
          ) : null}

          {expected || explanation ? (
              <details className="ui-surface-soft mt-3 p-3">
                <summary className="cursor-pointer list-none ui-meta-strong">
                  {t("details.summary", { fallback: "Show expected / explanation" } as any)}
                </summary>

                {expected ? (
                    <div className="mt-3">
                      <div className="ui-kicker">
                        {t("details.expected", { fallback: "Expected" } as any)}
                      </div>
                      <pre className="ui-surface-muted mt-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-[11px] text-[rgb(var(--ui-text-muted)/0.92)]">
                  {typeof expected === "string" ? expected : JSON.stringify(expected, null, 2)}
                </pre>
                    </div>
                ) : null}

                {explanation ? (
                    <div className="mt-3 border-t border-[rgb(var(--ui-border)/0.9)] pt-3">
                      <div className="ui-kicker">
                        {t("details.explanation", { fallback: "Explanation" } as any)}
                      </div>
                      <MathMarkdown
                          className="ui-quiz-markdown mt-1"
                          content={normalizeMath(String(explanation))}
                      />
                    </div>
                ) : null}
              </details>
          ) : null}
        </div>
      </article>
  );
}

export default function PracticeReviewList({
                                             stack,
                                             showOnlyIncorrect,
                                             maxAttempts,
                                             isLockedRun,
                                           }: {
  stack: QItem[];
  showOnlyIncorrect: boolean;
  maxAttempts: number;
  isLockedRun: boolean;
}) {
  const t = useTranslations("PracticeReviewList");

  const list = useMemo(() => {
    const base = Array.isArray(stack) ? stack : [];
    return showOnlyIncorrect ? base.filter((q) => q.result?.ok === false) : base;
  }, [stack, showOnlyIncorrect]);

  if (!list.length) {
    return (
        <div className="p-6 text-center">
          <div className="ui-page-surface mx-auto max-w-md border-dashed px-4 py-8">
            <div className="ui-title-sm">
              {showOnlyIncorrect
                  ? t("empty.incorrect", { fallback: "No incorrect questions." } as any)
                  : t("empty.all", { fallback: "No questions yet." } as any)}
            </div>
            <div className="mt-1 ui-meta">
              {showOnlyIncorrect
                  ? "Everything shown here is currently correct."
                  : "Your reviewed questions will appear here."}
            </div>
          </div>
        </div>
    );
  }

  return (
      <div className="grid gap-3 p-3 sm:gap-4 sm:p-4">
        {list.map((q, i) => (
            <ReadOnlyPracticeCard
                key={(q as any).key ?? (q as any).instanceId ?? `${i}-${showOnlyIncorrect ? "missed" : "all"}`}
                q={q}
                index={i}
                maxAttempts={maxAttempts}
                isLockedRun={isLockedRun}
            />
        ))}
      </div>
  );
}