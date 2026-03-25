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

function statusFor(q: QItem): { key: "revealed" | "correct" | "incorrect" | "unchecked"; tone: Tone } {
  if ((q as any).revealed) return { key: "revealed", tone: "info" };
  if (q.result?.ok === true) return { key: "correct", tone: "good" };
  if (q.result) return { key: "incorrect", tone: "danger" };
  return { key: "unchecked", tone: "neutral" };
}

function pillClass(tone: Tone) {
  if (tone === "good") {
    return "border-emerald-500/20 bg-emerald-500/[0.10] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.12] dark:text-emerald-300";
  }
  if (tone === "danger") {
    return "border-rose-500/20 bg-rose-500/[0.10] text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/[0.12] dark:text-rose-300";
  }
  if (tone === "info") {
    return "border-sky-500/20 bg-sky-500/[0.10] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/[0.12] dark:text-sky-300";
  }
  return "border-black/5 bg-black/[0.04] text-neutral-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60";
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
  const { t: tSafe } = useTaggedT();

  const exerciseRaw = q.exercise as Exercise | undefined;

  const { raw } = useTaggedT();

  const exercise = useMemo(() => {
    if (!exerciseRaw) return null;
    return resolveDeepTagged(exerciseRaw, (key) => String(raw(key, ""))) as Exercise;
  }, [exerciseRaw, raw]);

  const padRef = useRef<{ current: VectorPadState }>({ current: defaultVectorPadState() });

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
    const stdin = typeof ci.codeStdin === "string" ? ci.codeStdin : ((q as any).codeStdin ?? "");
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
      <article className="overflow-hidden rounded-2xl border border-black/5 bg-white p-3 shadow-[0_8px_24px_-20px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-neutral-500 dark:text-white/45">
              {t("questionLabel", { n: index + 1, fallback: `Question ${index + 1}` } as any)}
              {typeof (exercise as any).topic !== "undefined" ? (
                  <> • {String((exercise as any).topic).toUpperCase()}</>
              ) : null}
              <> • {String(exercise.kind).replaceAll("_", " ")}</>
            </div>

            {exercise.title ? (
                <div className="mt-1 line-clamp-2 text-sm font-black text-neutral-900 dark:text-white sm:text-[15px]">
                  {String(exercise.title)}
                </div>
            ) : null}
          </div>

          <div
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${pillClass(st.tone)}`}
          >
            {statusLabel}
          </div>
        </div>

        {/*{exercise.prompt ? (*/}
        {/*    <MathMarkdown*/}
        {/*        className="mt-3 text-sm text-neutral-700 dark:text-white/75 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-2"*/}
        {/*        content={normalizeMath(String(exercise.prompt))}*/}
        {/*    />*/}
        {/*) : null}*/}

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

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <div className="rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-neutral-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/60">
              {t("attemptsLabel", { fallback: "Attempts:" } as any)}{" "}
              <span className="font-black text-neutral-900 dark:text-white">
              {(q as any).attempts ?? 0}/{isLockedRun ? maxAttempts : "∞"}
            </span>
            </div>

            {ok === true ? (
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.10] px-2.5 py-1 font-black text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.12] dark:text-emerald-300">
                  ✓ Correct
                </div>
            ) : (q as any).result ? (
                <div className="rounded-full border border-rose-500/20 bg-rose-500/[0.10] px-2.5 py-1 font-black text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/[0.12] dark:text-rose-300">
                  ✕ Not correct
                </div>
            ) : (
                <div className="rounded-full border border-black/5 bg-black/[0.03] px-2.5 py-1 text-neutral-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/50">
                  {t("mini.unchecked", { fallback: "Not checked yet" } as any)}
                </div>
            )}
          </div>

          {showHiddenNote ? (
              <div className="mt-3 rounded-xl border border-black/5 bg-black/[0.03] px-3 py-2 text-[11px] font-semibold text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
                {t("hiddenCorrect", { fallback: "Correct answer is hidden for this run." } as any)}
              </div>
          ) : null}

          {expected || explanation ? (
              <details className="mt-3 rounded-xl border border-black/5 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <summary className="cursor-pointer list-none text-xs font-extrabold text-neutral-900 dark:text-white">
                  {t("details.summary", { fallback: "Show expected / explanation" } as any)}
                </summary>

                {expected ? (
                    <div className="mt-3">
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-neutral-500 dark:text-white/45">
                        {t("details.expected", { fallback: "Expected" } as any)}
                      </div>
                      <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 text-[11px] text-neutral-700 dark:bg-black/20 dark:text-white/75">
                  {typeof expected === "string" ? expected : JSON.stringify(expected, null, 2)}
                </pre>
                    </div>
                ) : null}

                {explanation ? (
                    <div className="mt-3 border-t border-black/5 pt-3 dark:border-white/10">
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-neutral-500 dark:text-white/45">
                        {t("details.explanation", { fallback: "Explanation" } as any)}
                      </div>
                      <MathMarkdown
                          className="mt-1 text-xs text-neutral-700 dark:text-white/75"
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
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-8 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="text-sm font-black text-neutral-900 dark:text-white">
              {showOnlyIncorrect
                  ? t("empty.incorrect", { fallback: "No incorrect questions." } as any)
                  : t("empty.all", { fallback: "No questions yet." } as any)}
            </div>
            <div className="mt-1 text-xs text-neutral-500 dark:text-white/50">
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