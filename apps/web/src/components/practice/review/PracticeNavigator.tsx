"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";

import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import PracticeScopeSelector from "@/components/practice/shell/PracticeScopeSelector";
import PracticeLeaderboardRail from "@/components/practice/leaderboard/PracticeLeaderboardRail";
import { shouldShowPracticeLeaderboard } from "@/components/practice/leaderboard/visibility";
import { cn } from "@/lib/cn";
import { resolvePracticeQueueStatus } from "@/lib/practice/experience/queueStatus";
import {
  resolvePracticeDisplayStack,
  resolvePracticeQueuePlaceholderStatus,
} from "@/lib/practice/experience/reviewDisplayStack";

type NavigatorPanel = "controls" | "leaderboard";

type PracticeNavigatorProps = PracticeShellProps & {
  onResetCurrentExercise: () => void;
};

function SelectField<T extends string>({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: T;
  disabled: boolean;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="ui-meta-strong">{label}</span>
      <select
        className="ui-select-ide mt-0 w-full disabled:cursor-not-allowed disabled:opacity-60"
        value={value}
        disabled={disabled}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value as T)
        }
      >
        {options.map((option) => (
          <option key={String(option.id)} value={String(option.id)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function experienceCopy(
  props: PracticeShellProps,
  t: ReturnType<typeof useTranslations>,
) {
  switch (props.experienceMode) {
    case "daily_five":
      return {
        eyebrow: t("navigator.dailyEyebrow"),
        title: t("navigator.dailyTitle", { count: props.sessionSize }),
        subtitle: t("navigator.dailySubtitle"),
      };
    case "public_challenge":
      return {
        eyebrow: t("navigator.challengeEyebrow"),
        title: props.challengeTitle || t("navigator.challengeDefaultTitle"),
        subtitle: t("navigator.challengeSubtitle"),
      };
    case "standard":
      return {
        eyebrow: props.viewer.subscribed
          ? t("navigator.subscriberEyebrow")
          : t("navigator.freeEyebrow"),
        title: t("navigator.chooseTitle"),
        subtitle: props.viewer.subscribed
          ? t("navigator.subscriberSubtitle")
          : t("navigator.freeSubtitle"),
      };
    default:
      return {
        eyebrow: t("navigator.defaultEyebrow"),
        title: t("navigator.defaultTitle"),
        subtitle: t("navigator.defaultSubtitle"),
      };
  }
}

export default function PracticeNavigator(props: PracticeNavigatorProps) {
  const t = useTranslations("Practice");
  const tw = useTranslations("Practice.workspace");
  const [activePanel, setActivePanel] = useState<NavigatorPanel>("controls");
  const copy = experienceCopy(props, tw);
  const locale = props.locale || "en";
  const isDailyPractice = props.experienceMode === "daily_five";
  const queueStack = resolvePracticeDisplayStack({
    stack: props.stack,
    reviewStack: props.reviewStack,
    answeredCount: props.answeredCount,
  });
  const canChooseCatalog =
    props.experienceMode === "standard" && props.viewer.subscribed;
  const catalogVisible =
    props.experienceMode === "standard" || isDailyPractice;
  const filtersFixed = props.experienceMode !== "standard";
  const showLeaderboard = Boolean(
    props.leaderboardUrl &&
      shouldShowPracticeLeaderboard(props.experienceMode),
  );
  const refreshKey = [
    props.phase,
    props.answeredCount,
    props.correctCount,
    props.current?.key ?? "none",
    props.current?.result?.ok === true ? "correct" : "pending",
    props.current?.revealed ? "revealed" : "hidden",
  ].join(":");

  return (
    <div className="flex min-h-full flex-col bg-[rgb(var(--ui-bg)/0.72)]">
      <div className="border-b border-[rgb(var(--ui-border)/0.78)] p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[rgb(var(--ui-text-muted)/0.8)]">
          {copy.eyebrow}
        </div>
        <h2 className="mt-1 text-lg font-black tracking-tight text-[rgb(var(--ui-text))]">
          {copy.title}
        </h2>
        <p className="mt-1 text-xs font-medium leading-5 text-[rgb(var(--ui-text-muted)/0.9)]">
          {copy.subtitle}
        </p>

        <div
          className="mt-4 grid grid-cols-2 rounded-xl border border-[rgb(var(--ui-border)/0.78)] bg-[rgb(var(--ui-muted)/0.52)] p-1"
          role="tablist"
          aria-label={tw("navigator.sidebarTabsAria")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "controls"}
            onClick={() => setActivePanel("controls")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-black transition",
              activePanel === "controls"
                ? "bg-[rgb(var(--ui-surface))] text-[rgb(var(--ui-text))] shadow-sm"
                : "text-[rgb(var(--ui-text-muted))] hover:text-[rgb(var(--ui-text))]",
            )}
          >
            {tw("navigator.controlsTab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activePanel === "leaderboard"}
            disabled={!showLeaderboard}
            onClick={() => setActivePanel("leaderboard")}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-45",
              activePanel === "leaderboard"
                ? "bg-[rgb(var(--ui-surface))] text-[rgb(var(--ui-text))] shadow-sm"
                : "text-[rgb(var(--ui-text-muted))] hover:text-[rgb(var(--ui-text))]",
            )}
          >
            {tw("navigator.leaderboardTab")}
          </button>
        </div>
      </div>

      {activePanel === "leaderboard" && showLeaderboard && props.leaderboardUrl ? (
        <div className="p-3" role="tabpanel">
          <PracticeLeaderboardRail
            leaderboardUrl={props.leaderboardUrl}
            viewer={props.viewer}
            experienceMode={props.experienceMode}
            refreshKey={refreshKey}
          />
        </div>
      ) : (
        <div role="tabpanel">
          <div className="grid grid-cols-2 gap-2 border-b border-[rgb(var(--ui-border)/0.78)] p-3">
            <div className="rounded-xl border border-[rgb(var(--ui-border)/0.78)] bg-[rgb(var(--ui-surface)/0.9)] p-3">
              <div className="ui-meta">{tw("navigator.progress")}</div>
              <div className="mt-1 text-base font-black tabular-nums">
                {props.answeredCount}/{props.sessionSize}
              </div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--ui-border)/0.78)] bg-[rgb(var(--ui-surface)/0.9)] p-3">
              <div className="ui-meta">{tw("navigator.correct")}</div>
              <div className="mt-1 text-base font-black tabular-nums">
                {props.correctCount}
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-[rgb(var(--ui-border)/0.78)] p-3">
            <PracticeScopeSelector
              locale={locale}
              subjectSlug={props.subjectSlug}
              moduleSlug={props.moduleSlug}
              enabled={canChooseCatalog}
              catalogVisible={catalogVisible}
              showModule={!isDailyPractice}
              lockedReason={
                isDailyPractice
                  ? tw("navigator.dailySubjectReason")
                  : filtersFixed
                    ? tw("navigator.fixedReason")
                  : canChooseCatalog
                    ? null
                    : tw("navigator.subscribeReason")
              }
            />

            {isDailyPractice ? (
              <div className="ui-surface-muted p-3 text-xs font-medium leading-5 text-[rgb(var(--ui-text-muted))]">
                {tw("navigator.dailyMixReason")}
              </div>
            ) : (
              <div className="ui-surface-muted grid gap-3 p-3">
                <SelectField
                  label={t("filters.topic")}
                  value={props.topic as any}
                  disabled={props.topicLocked || !canChooseCatalog}
                  options={props.topicOptionsFixed as any}
                  onChange={(value) => props.setTopic(value as any)}
                />
                <SelectField
                  label={t("filters.difficulty")}
                  value={props.difficulty as any}
                  disabled={props.difficultyLocked || !canChooseCatalog}
                  options={props.difficultyOptions as any}
                  onChange={(value) => props.setDifficulty(value as any)}
                />
              </div>
            )}
          </div>

          <div className="border-b border-[rgb(var(--ui-border)/0.78)] p-3">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div className="ui-meta-strong">{tw("navigator.queue")}</div>
              <span className="ui-pill-neutral">
                {props.badge || tw("navigator.fallbackBadge")}
              </span>
            </div>
            <ol className="grid gap-1.5">
              {Array.from({ length: Math.max(1, props.sessionSize) }).map(
                (_, index) => {
                  const item = queueStack[index] ?? null;
                  const isActive =
                    index === props.idx && props.phase === "practice";
                  const queueStatus = item
                    ? resolvePracticeQueueStatus(item)
                    : resolvePracticeQueuePlaceholderStatus({
                        index,
                        answeredCount: props.answeredCount,
                      });
                  const isCorrect = queueStatus === "correct";
                  const isRevealed = queueStatus === "revealed";
                  const isFinalized = queueStatus === "completed";
                  const isInProgress = queueStatus === "in_progress";

                  return (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => {
                          if (index < queueStack.length && index < props.stack.length) {
                            props.setIdx(index);
                          }
                        }}
                        disabled={index >= queueStack.length || index >= props.stack.length}
                        className={[
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                          isActive
                            ? "border-emerald-300/70 bg-emerald-50/80 dark:border-emerald-300/30 dark:bg-emerald-300/10"
                            : "border-[rgb(var(--ui-border)/0.72)] bg-[rgb(var(--ui-surface)/0.82)]",
                          index >= queueStack.length || index >= props.stack.length
                            ? "cursor-default opacity-55"
                            : "hover:bg-[rgb(var(--ui-muted)/0.72)]",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black",
                            isCorrect
                              ? "bg-emerald-500 text-white"
                              : isRevealed || isFinalized
                                ? "bg-amber-100 text-amber-900 dark:bg-amber-300/20 dark:text-amber-100"
                                : isInProgress || isActive
                                  ? "bg-[rgb(var(--ui-primary)/0.14)] text-[rgb(var(--ui-primary))]"
                                  : "bg-[rgb(var(--ui-muted)/0.9)] text-[rgb(var(--ui-text-muted))]",
                          ].join(" ")}
                        >
                          {isCorrect ? "✓" : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            {item?.exercise?.title ||
                              tw("navigator.exerciseFallback", {
                                number: index + 1,
                              })}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[rgb(var(--ui-text-muted)/0.84)]">
                            {isCorrect
                              ? tw("navigator.statusCorrect")
                              : isRevealed
                                ? tw("navigator.statusRevealed")
                                : isFinalized
                                  ? tw("navigator.statusCompleted")
                                  : isInProgress
                                    ? tw("navigator.statusInProgress")
                                    : isActive
                                      ? tw("navigator.statusCurrent")
                                      : tw("navigator.statusNotStarted")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                },
              )}
            </ol>
          </div>

          <div className="p-3">
            <button
              type="button"
              onClick={props.onResetCurrentExercise}
              disabled={!props.current || !props.exercise || props.busy || props.submitBusy}
              className="ui-btn ui-btn-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              ↺ {tw("navigator.resetExercise")}
            </button>
            <p className="mt-2 px-1 text-[11px] font-medium leading-4 text-[rgb(var(--ui-text-muted)/0.84)]">
              {tw("navigator.resetExerciseDescription")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
