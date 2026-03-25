"use client";

import React, { useMemo } from "react";
import type { PracticeShellProps } from "../PracticeShell";
import PracticeReviewList from "@/components/practice/MissedPracticeCard";
import SummaryViewSkeleton from "@/components/practice/shell/SummaryViewSkeleton";

function StatCard({
                    label,
                    value,
                    tone = "neutral",
                  }: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "danger";
}) {
  const toneClass =
      tone === "good"
          ? "border-emerald-500/20 bg-emerald-500/[0.08] dark:border-emerald-400/20 dark:bg-emerald-400/[0.10]"
          : tone === "danger"
              ? "border-rose-500/20 bg-rose-500/[0.08] dark:border-rose-400/20 dark:bg-rose-400/[0.10]"
              : "border-black/5 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04]";

  return (
      <div className={`rounded-2xl border p-4 ${toneClass}`}>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-neutral-500 dark:text-white/45">
          {label}
        </div>
        <div className="mt-1 text-base font-black text-neutral-900 dark:text-white">
          {value}
        </div>
      </div>
  );
}

export default function SummaryView(props: PracticeShellProps) {
  const {
    t,
    answeredCount,
    correctCount,
    pct,
    sessionSize,

    stack,
    reviewStack,
    maxAttempts,
    isLockedRun,
    isOnboardingTrial,

    showMissed,
    setShowMissed,
    returnUrl,
    onReturn,
  } = props as any;

  const loading =
      !Array.isArray(stack) ||
      (reviewStack != null && !Array.isArray(reviewStack));

  if (loading) {
    return <SummaryViewSkeleton />;
  }

  const list = useMemo(() => {
    const rs = Array.isArray(reviewStack) ? reviewStack : [];
    const st = Array.isArray(stack) ? stack : [];
    return rs.length ? rs : st;
  }, [reviewStack, stack]);

  const missedCount = Math.max(0, answeredCount - correctCount);
  const showOnboardingCta = Boolean(isOnboardingTrial);

  const reviewCount = showMissed
      ? list.filter((q: any) => q?.result?.ok === false).length
      : list.length;

  const reviewToggleLabel = showOnboardingCta
      ? showMissed
          ? "Show all questions"
          : "Show missed only"
      : showMissed
          ? t("summary.toggleMissedShow")
          : t("summary.toggleMissedHide");

  return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">
        <div className="ui-container py-4 md:py-6">
          <div className="mx-auto grid max-w-5xl gap-4 md:gap-5">
            <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_12px_40px_-24px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
              <div className="border-b border-black/5 bg-black/[0.02] px-4 py-4 dark:border-white/10 dark:bg-white/[0.03] sm:px-5 sm:py-5">
                <div className="text-lg font-black tracking-tight sm:text-xl">
                  {showOnboardingCta
                      ? "Your trial is complete 🎉"
                      : `${t("summary.title")} 🎉`}
                </div>
                <div className="mt-1 text-sm text-neutral-600 dark:text-white/65">
                  {showOnboardingCta
                      ? `You finished all ${sessionSize} onboarding questions.`
                      : t("summary.subtitle", { answered: answeredCount, sessionSize })}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                      label={t("summaryCards.score")}
                      value={`${pct}%`}
                      tone={pct >= 70 ? "good" : pct < 50 ? "danger" : "neutral"}
                  />
                  <StatCard
                      label="Correct"
                      value={`${correctCount}`}
                      tone="good"
                  />
                  <StatCard
                      label="Missed"
                      value={`${missedCount}`}
                      tone={missedCount > 0 ? "danger" : "neutral"}
                  />
                </div>

                <div className="mt-4 text-sm text-neutral-600 dark:text-white/65">
                  {showOnboardingCta
                      ? "Nice work. Your short trial gives us a quick signal for where to guide you next."
                      : t("summaryCards.niceWork")}
                </div>
              </div>
            </div>

            {showOnboardingCta ? (
                <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_12px_40px_-24px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
                  <div className="border-b border-black/5 bg-black/[0.02] px-4 py-4 dark:border-white/10 dark:bg-white/[0.03] sm:px-5 sm:py-5">
                    <div className="text-base font-black tracking-tight sm:text-lg">
                      Continue your learning path
                    </div>
                    <div className="mt-1 text-sm text-neutral-600 dark:text-white/65">
                      Save your progress, unlock the full path, and keep going from here.
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <button
                          className="ui-btn ui-btn-primary min-h-11 px-4 py-2.5 text-sm font-extrabold"
                          onClick={() => onReturn?.()}
                          type="button"
                      >
                        Create account to continue
                      </button>

                      <button
                          className="ui-btn ui-btn-secondary min-h-11 px-4 py-2.5 text-sm font-extrabold"
                          onClick={() => setShowMissed(!showMissed)}
                          type="button"
                      >
                        {showMissed ? "Show all questions" : "Review missed questions"}
                      </button>
                    </div>

                    <div className="mt-3 text-xs text-neutral-500 dark:text-white/50">
                      Signing in lets you keep your progress and continue with your recommended path.
                    </div>
                  </div>
                </div>
            ) : null}

            {!showOnboardingCta && returnUrl ? (
                <div className="flex justify-start">
                  <button
                      className="ui-btn ui-btn-secondary min-h-10 px-4 py-2 text-sm font-extrabold"
                      onClick={() => onReturn?.()}
                      type="button"
                  >
                    {t("summary.return")}
                  </button>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_12px_40px_-24px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
              <div className="flex flex-col gap-3 border-b border-black/5 bg-black/[0.02] px-4 py-4 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <div className="text-sm font-black tracking-tight sm:text-base">
                    {t("summary.reviewTitle")}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">
                    {t("summary.reviewSubtitle")}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-black/5 bg-white px-2.5 py-1 text-[11px] font-extrabold text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
                    {reviewCount} shown
                  </div>

                  <button
                      className="ui-btn ui-btn-secondary min-h-10 px-3 py-2 text-xs font-extrabold"
                      onClick={() => setShowMissed(!showMissed)}
                      type="button"
                  >
                    {reviewToggleLabel}
                  </button>
                </div>
              </div>

              <PracticeReviewList
                  stack={list}
                  showOnlyIncorrect={showMissed}
                  maxAttempts={maxAttempts}
                  isLockedRun={isLockedRun}
              />
            </div>
          </div>
        </div>
      </div>
  );
}