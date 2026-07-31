"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/cn";
import DailyResetCountdown from "@/components/practice/completion/DailyResetCountdown";
import { resolvePracticeDisplayStack } from "@/lib/practice/experience/reviewDisplayStack";
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

function completionCopy(props: PracticeShellProps, challengePassed: boolean) {
  const title = props.challengeTitle || "the selected challenge";

  switch (props.experienceMode) {
    case "public_challenge":
      return {
        title: challengePassed ? "Challenge solved 🎉" : "Challenge complete",
        subtitle: challengePassed
          ? `You solved ${title}.`
          : `You completed ${title} with help or used all available attempts.`,
        note: props.viewer.authenticated
          ? "Nice work. Continue with another practice exercise."
          : "Nice work. Create a free account to save progress and keep practicing.",
      };
    case "onboarding_trial":
      return {
        title: "Your onboarding trial is complete 🎉",
        subtitle: `You finished all ${props.sessionSize} onboarding questions.`,
        note: "This short trial helps us recommend where to start.",
      };
    case "daily_five": {
      const count = props.sessionSize;
      const exerciseLabel = count === 1 ? "exercise" : "exercises";
      return {
        title: "Daily practice complete 🎉",
        subtitle: `You completed today’s ${count} unique code ${exerciseLabel}.`,
        note: props.viewer.subscribed
          ? "Your ranked daily practice is done. Unlimited practice is still available."
          : "Come back tomorrow for another ranked daily practice, or subscribe for unlimited practice.",
      };
    }
    case "assignment": {
      const revealedCount = Array.isArray(props.stack)
        ? props.stack.filter((item) => Boolean(item?.revealed)).length
        : 0;

      return {
        title: props.t("workspace.assignment.summaryTitle"),
        subtitle: props.t("workspace.assignment.summarySubtitle", {
          completed: props.answeredCount,
          total: props.sessionSize,
        }),
        note: props.t("workspace.assignment.summaryNote", {
          correct: props.correctCount,
          revealed: revealedCount,
        }),
      };
    }
    default:
      return {
        title: `${props.t("summary.title")} 🎉`,
        subtitle: props.t("summary.subtitle", {
          answered: props.answeredCount,
          sessionSize: props.sessionSize,
        }),
        note: props.t("summaryCards.niceWork"),
      };
  }
}

function CompletionAction(props: PracticeShellProps) {
  if (props.experienceMode === "assignment") {
    return (
      <div className="flex justify-start">
        <button
          className="ui-btn-primary min-h-11 px-4 py-2.5 text-sm"
          onClick={() => props.onReturn?.()}
          type="button"
        >
          {props.t("summary.assignmentReturn")}
        </button>
      </div>
    );
  }

  const guestAcquisition =
    props.viewer.tier === "guest" &&
    (props.experienceMode === "public_challenge" ||
      props.experienceMode === "onboarding_trial");

  if (guestAcquisition) {
    return (
      <div className="ui-page-surface overflow-hidden">
        <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-4 sm:px-5">
          <div className="text-base font-semibold tracking-tight sm:text-lg">
            Practice more with a free account
          </div>
          <div className="mt-1 text-sm text-[rgb(var(--ui-text-muted)/0.84)]">
            Save your progress and continue with lessons and daily practice.
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <button
            className="ui-btn-primary min-h-11 px-4 py-2.5 text-sm"
            onClick={() => props.onReturn?.()}
            type="button"
          >
            Create an account and practice more
          </button>
        </div>
      </div>
    );
  }

  if (props.experienceMode === "daily_five" && !props.viewer.subscribed) {
    return (
      <div className="ui-page-surface overflow-hidden">
        <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-4 sm:px-5">
          <div className="text-base font-semibold tracking-tight sm:text-lg">
            {props.t("completion.daily.title")}
          </div>
          <div className="mt-1 text-sm text-[rgb(var(--ui-text-muted)/0.84)]">
            {props.t("completion.daily.freeNote")}
          </div>
        </div>
        <div className="grid gap-4 p-4 sm:p-5">
          <DailyResetCountdown nextResetAt={props.dailyResetAt} compact />
          <div className="flex flex-wrap gap-2">
            <button
              className="ui-btn-primary min-h-11 px-4 py-2.5 text-sm"
              onClick={() => props.onReturn?.()}
              type="button"
            >
              {props.t("completion.daily.freePrimary")}
            </button>
            {props.leaderboardUrl ? (
              <a
                className="ui-btn-secondary min-h-11 px-4 py-2.5 text-sm"
                href={props.leaderboardUrl}
              >
                {props.t("completion.leaderboard")}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (
    props.viewer.authenticated &&
    (props.experienceMode === "public_challenge" ||
      props.experienceMode === "daily_five" ||
      props.experienceMode === "standard")
  ) {
    return (
      <div className="grid gap-3">
        {props.experienceMode === "daily_five" ? (
          <DailyResetCountdown nextResetAt={props.dailyResetAt} compact />
        ) : null}
        <div className="flex flex-wrap justify-start gap-2">
          <button
            className="ui-btn-primary min-h-11 px-4 py-2.5 text-sm"
            onClick={() => props.onReturn?.()}
            type="button"
          >
            {props.experienceMode === "public_challenge"
              ? "Practice more like this"
              : props.experienceMode === "daily_five"
                ? props.t("completion.daily.subscriberPrimary")
                : "Practice more"}
          </button>
          {props.experienceMode === "daily_five" && props.leaderboardUrl ? (
            <a
              className="ui-btn-secondary min-h-11 px-4 py-2.5 text-sm"
              href={props.leaderboardUrl}
            >
              {props.t("completion.leaderboard")}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (props.returnUrl) {
    return (
      <div className="flex justify-start">
        <button
          className="ui-btn-secondary min-h-10 px-4 py-2 text-sm"
          onClick={() => props.onReturn?.()}
          type="button"
        >
          {props.t("summary.return")}
        </button>
      </div>
    );
  }

  return null;
}

export default function SummaryView(props: PracticeShellProps & { layoutMode?: "page" | "embedded" }) {
  const {
    t,
    answeredCount,
    correctCount,
    pct,
    stack,
    reviewStack,
    maxAttempts,
    isLockedRun,
    showMissed,
    setShowMissed,
  } = props;

  const loading =
    !Array.isArray(stack) ||
    (reviewStack != null && !Array.isArray(reviewStack));

  const list = useMemo(
    () =>
      resolvePracticeDisplayStack({
        stack,
        reviewStack,
        answeredCount,
      }),
    [answeredCount, reviewStack, stack],
  );

  if (loading) return <SummaryViewSkeleton />;

  const missedCount = Math.max(0, answeredCount - correctCount);
  const challengePassed = correctCount > 0;
  const copy = completionCopy(props, challengePassed);
  const reviewCount = showMissed
    ? list.filter((question: any) => question?.result?.ok === false).length
    : list.length;
  const hideDetailedReview =
    props.experienceMode === "public_challenge" ||
    props.experienceMode === "assignment";

  const embedded = props.layoutMode === "embedded";

  return (
    <div
      className={embedded ? "w-full" : "min-h-screen"}
      style={{
        backgroundColor: "rgb(var(--ui-bg) / 1)",
        color: "rgb(var(--ui-text) / 1)",
      }}
    >
      <div className={embedded ? "p-3 sm:p-4" : "ui-container py-4 md:py-6"}>
        <div className={embedded ? "grid gap-4 md:gap-5" : "mx-auto grid max-w-5xl gap-4 md:gap-5"}>
          <div className="ui-page-surface overflow-hidden">
            <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-4 sm:px-5 sm:py-5">
              <div className="text-lg font-semibold tracking-tight sm:text-xl">
                {copy.title}
              </div>
              <div className="mt-1 text-sm text-[rgb(var(--ui-text-muted)/0.84)]">
                {copy.subtitle}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  label={t("summaryCards.score")}
                  value={`${pct}%`}
                  tone={pct >= 70 ? "good" : pct < 50 ? "danger" : "neutral"}
                />
                <StatCard label="Correct" value={`${correctCount}`} tone="good" />
                <StatCard
                  label="Missed"
                  value={`${missedCount}`}
                  tone={missedCount > 0 ? "danger" : "neutral"}
                />
              </div>
              <div className="mt-4 text-sm text-[rgb(var(--ui-text-muted)/0.84)]">
                {copy.note}
              </div>
            </div>
          </div>

          <CompletionAction {...props} />

          {!hideDetailedReview ? (
            <div className="ui-page-surface overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
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
                    {showMissed
                      ? t("summary.toggleMissedShow")
                      : t("summary.toggleMissedHide")}
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
