"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/cn";
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
  return (
      <div
          className={cn(
              "p-4",
              tone === "good"
                  ? "ui-surface-success"
                  : tone === "danger"
                      ? "ui-surface-danger"
                      : "ui-stat-card",
          )}
      >
        <div className="ui-kicker">{label}</div>
        <div className="mt-1 text-base font-medium text-[rgb(var(--ui-text)/0.96)]">
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

  const list = useMemo(() => {
    const rs = Array.isArray(reviewStack) ? reviewStack : [];
    const st = Array.isArray(stack) ? stack : [];
    return rs.length ? rs : st;
  }, [reviewStack, stack]);

  if (loading) {
    return <SummaryViewSkeleton />;
  }

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
      <div
          className="min-h-screen"
          style={{
            backgroundColor: "rgb(var(--ui-bg) / 1)",
            color: "rgb(var(--ui-text) / 1)",
          }}
      >
        <div className="ui-container py-4 md:py-6">
          <div className="mx-auto grid max-w-5xl gap-4 md:gap-5">
            <div className="ui-page-surface overflow-hidden">
              <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-4 sm:px-5 sm:py-5">
                <div className="text-lg font-semibold tracking-tight sm:text-xl">
                  {showOnboardingCta
                      ? "Your trial is complete 🎉"
                      : `${t("summary.title")} 🎉`}
                </div>
                <div className="mt-1 text-sm text-[rgb(var(--ui-text-muted)/0.84)]">
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

                <div className="mt-4 text-sm text-[rgb(var(--ui-text-muted)/0.84)]">
                  {showOnboardingCta
                      ? "Nice work. Your short trial gives us a quick signal for where to guide you next."
                      : t("summaryCards.niceWork")}
                </div>
              </div>
            </div>

            {showOnboardingCta ? (
                <div className="ui-page-surface overflow-hidden">
                  <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-4 sm:px-5 sm:py-5">
                    <div className="text-base font-semibold tracking-tight sm:text-lg">
                      Continue your learning path
                    </div>
                    <div className="mt-1 text-sm text-[rgb(var(--ui-text-muted)/0.84)]">
                      Save your progress, unlock the full path, and keep going from here.
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <button
                          className="ui-btn-primary min-h-11 px-4 py-2.5 text-sm"
                          onClick={() => onReturn?.()}
                          type="button"
                      >
                        Create account to continue
                      </button>

                      <button
                          className="ui-btn-secondary min-h-11 px-4 py-2.5 text-sm"
                          onClick={() => setShowMissed(!showMissed)}
                          type="button"
                      >
                        {showMissed ? "Show all questions" : "Review missed questions"}
                      </button>
                    </div>

                    <div className="mt-3 ui-meta">
                      Signing in lets you keep your progress and continue with your recommended path.
                    </div>
                  </div>
                </div>
            ) : null}

            {!showOnboardingCta && returnUrl ? (
                <div className="flex justify-start">
                  <button
                      className="ui-btn-secondary min-h-10 px-4 py-2 text-sm"
                      onClick={() => onReturn?.()}
                      type="button"
                  >
                    {t("summary.return")}
                  </button>
                </div>
            ) : null}

            <div className="ui-page-surface overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <div className="ui-title-sm">{t("summary.reviewTitle")}</div>
                  <div className="mt-1 ui-meta">{t("summary.reviewSubtitle")}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="ui-pill-neutral">{reviewCount} shown</span>

                  <button
                      className="ui-btn-secondary min-h-10 px-3 py-2 text-xs"
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
