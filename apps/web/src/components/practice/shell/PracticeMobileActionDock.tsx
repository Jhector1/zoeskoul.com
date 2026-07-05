"use client";

import React from "react";
import type { PracticeShellProps } from "../PracticeShell";
import { resolvePracticeMobilePrimaryAction } from "./mobileActionState";

function TrophyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M8 4h8v3.5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.5v1A3.5 3.5 0 0 0 9 10.5M16 6h2.5v1a3.5 3.5 0 0 1-3.5 3.5M12 12v4M8.5 20h7M10 16h4" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M8.2 14.5A7 7 0 1 1 15.8 14.5c-.9.7-1.4 1.5-1.5 2.5h-4.6c-.1-1-.6-1.8-1.5-2.5Z" />
    </svg>
  );
}

function ControlsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
    </svg>
  );
}

function statusCopy(props: {
  current: PracticeShellProps["current"];
  actionErr: string | null;
  t: PracticeShellProps["t"];
}) {
  const { current, actionErr, t } = props;
  if (actionErr) return t("mobile.statusError");
  if (current?.revealed || (current?.result as any)?.revealUsed) return t("mobile.statusRevealed");
  if (current?.result?.ok === true) return t("mobile.statusCorrect");
  if (current?.result?.ok === false) return t("mobile.statusTryAgain");
  return t("mobile.statusReady");
}

export default function PracticeMobileActionDock({
  props,
  canSubmitNow,
  finalized,
  outOfAttempts,
  showLeaderboard,
  onOpenControls,
  onOpenHelp,
  onOpenLeaderboard,
}: {
  props: PracticeShellProps;
  canSubmitNow: boolean;
  finalized: boolean;
  outOfAttempts: boolean;
  showLeaderboard: boolean;
  onOpenControls: () => void;
  onOpenHelp: () => void;
  onOpenLeaderboard: () => void;
}) {
  const {
    t,
    current,
    exercise,
    busy,
    submitBusy,
    canGoNext,
    goNext,
    submit,
    answeredCount,
    sessionSize,
    maxAttempts,
    pendingRevealCompletion,
    finishRevealedSession,
  } = props;

  const attempts = current?.attempts ?? 0;
  const primaryAction = resolvePracticeMobilePrimaryAction({
    hasCurrent: Boolean(current),
    submitted: Boolean(current?.submitted),
    finalized,
    outOfAttempts,
    canGoNext,
  });
  const canFinishReveal = Boolean(pendingRevealCompletion);
  const canAdvance = primaryAction === "next";
  const primaryLabel = canFinishReveal
    ? t("mobile.continue")
    : canAdvance
      ? t("buttons.next")
    : submitBusy
      ? t("mobile.submitting")
      : t("buttons.submit");
  const primaryDisabled = canFinishReveal
    ? busy || !finishRevealedSession
    : canAdvance
      ? busy || !canGoNext
      : submitBusy || busy || !exercise || finalized || outOfAttempts || !canSubmitNow;

  async function runPrimaryAction() {
    if (canFinishReveal) {
      await finishRevealedSession?.();
      return;
    }
    if (canAdvance) {
      await goNext();
      return;
    }
    await submit();
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-[rgb(var(--ui-border)/0.85)] bg-[rgb(var(--ui-bg)/0.9)] px-3 pt-2.5 shadow-[0_-16px_36px_rgba(0,0,0,0.12)] backdrop-blur-xl xl:hidden"
      style={{ paddingBottom: "calc(0.65rem + env(safe-area-inset-bottom))" }}
      data-testid="practice-mobile-action-dock"
    >
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={onOpenControls}
          className="mb-2 flex w-full items-center justify-between gap-3 rounded-lg px-1 text-left text-[11px] text-[rgb(var(--ui-text-muted)/0.9)]"
        >
          <span className="min-w-0 truncate font-semibold text-[rgb(var(--ui-text)/0.88)]">
            {statusCopy({ current, actionErr: props.actionErr, t })}
          </span>
          <span className="shrink-0 tabular-nums">
            {answeredCount}/{sessionSize}
            {current ? ` • ${attempts}/${Number.isFinite(maxAttempts) ? maxAttempts : "∞"}` : ""}
          </span>
        </button>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
          <button
            type="button"
            className="ui-btn-primary min-h-12 w-full justify-center px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void runPrimaryAction()}
            disabled={primaryDisabled}
          >
            {submitBusy && !canAdvance ? <span className="ui-quiz-spinner" aria-hidden /> : null}
            <span>{primaryLabel}</span>
          </button>

          <button
            type="button"
            className="ui-btn-secondary min-h-12 min-w-12 justify-center px-3 text-xs"
            onClick={onOpenHelp}
            aria-label={t("mobile.help")}
          >
            <HelpIcon />
            <span className="hidden min-[430px]:inline">{t("mobile.help")}</span>
          </button>

          <button
            type="button"
            className="ui-btn-secondary min-h-12 min-w-12 justify-center px-3 text-xs"
            onClick={showLeaderboard ? onOpenLeaderboard : onOpenControls}
            aria-label={showLeaderboard ? t("mobile.leaderboard") : t("mobile.controls")}
          >
            {showLeaderboard ? <TrophyIcon /> : <ControlsIcon />}
            <span className="hidden min-[500px]:inline">
              {showLeaderboard ? t("mobile.leaderboard") : t("mobile.controls")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
