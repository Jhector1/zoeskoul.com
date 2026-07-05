"use client";

import React, { useMemo, useState } from "react";
import type { Exercise } from "@/lib/practice/types";
import type { PracticeHelpPolicy } from "@/lib/practice/help/steps";
import {
  DEFAULT_PRACTICE_HELP_POLICY,
  PRACTICE_HELP_STEP_DEF_MAP,
} from "@/lib/practice/help/steps";
import type { QItem } from "@/lib/practice/uiTypes";
import PracticeHelpPanel from "../PracticeHelpPanel";
import type { TFn } from "../PracticeShell";
import { resolveMobilePracticeHelpState } from "./mobileHelpState";

export default function PracticeMobileHelpPanel({
  t,
  exercise,
  current,
  helpPolicy,
  allowReveal,
  busy,
  maxAttempts,
  openHelp,
  updateCurrent,
  codeInputId,
  pendingRevealCompletion,
  finishRevealedSession,
  onClose,
}: {
  t: TFn;
  exercise: Exercise | null;
  current: QItem | null;
  helpPolicy?: PracticeHelpPolicy | null;
  allowReveal: boolean;
  busy: boolean;
  maxAttempts: number;
  openHelp: (stepKey?: string) => Promise<void> | void;
  updateCurrent: (patch: Partial<QItem>) => void;
  codeInputId?: string;
  pendingRevealCompletion?: boolean;
  finishRevealedSession?: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [confirmReveal, setConfirmReveal] = useState(false);
  const enabledStepKeys = useMemo(
    () =>
      helpPolicy?.stepKeys?.length
        ? helpPolicy.stepKeys
        : DEFAULT_PRACTICE_HELP_POLICY.stepKeys,
    [helpPolicy],
  );
  const openedStepKeys = current?.help?.openedStepKeys ?? [];
  const state = useMemo(
    () =>
      resolveMobilePracticeHelpState({
        enabledStepKeys,
        openedStepKeys,
        allowReveal,
      }),
    [allowReveal, enabledStepKeys, openedStepKeys],
  );

  if (!current || !exercise) {
    return <div className="ui-meta p-3">{t("mobile.helpUnavailable")}</div>;
  }

  const attemptsUsed = current.attempts ?? 0;
  const attemptsRemaining = Number.isFinite(maxAttempts)
    ? Math.max(0, maxAttempts - attemptsUsed)
    : null;
  const helpBusy = busy || Boolean(current.help?.busyStepKey);
  const solved = current.result?.ok === true;
  const revealed = Boolean(
    current.revealed ||
      (current.result as any)?.revealUsed ||
      state.revealOpened,
  );
  const canReveal = state.revealEnabled && !solved && !revealed;
  const nextHintLabel = state.nextHintKey
    ? PRACTICE_HELP_STEP_DEF_MAP.get(state.nextHintKey)?.label ??
      t("mobile.showHint")
    : null;

  async function openStep(stepKey: string) {
    if (stepKey === "reveal") {
      setConfirmReveal(true);
      return;
    }
    await openHelp(stepKey);
  }

  async function revealAnswer() {
    setConfirmReveal(false);
    await openHelp("reveal");
  }

  return (
    <div className="grid gap-3">
      <div className="ui-surface-soft p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="ui-title-sm">{t("mobile.helpIntroTitle")}</div>
            <div className="mt-1 ui-meta">{t("mobile.helpIntro")}</div>
          </div>
          {attemptsRemaining != null ? (
            <span className="ui-pill-neutral shrink-0 tabular-nums">
              {t("mobile.attemptsRemaining", { count: attemptsRemaining })}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
          <span className="text-[rgb(var(--ui-text-muted)/0.9)]">
            {t("mobile.hintsUsed", {
              used: state.openedHintKeys.length,
              total: state.hintKeys.length,
            })}
          </span>
          {state.nextHintKey && !solved && !revealed ? (
            <button
              type="button"
              className="ui-btn-primary min-h-10 px-3 text-xs disabled:opacity-60"
              disabled={helpBusy}
              onClick={() => void openStep(state.nextHintKey as string)}
            >
              {helpBusy ? t("mobile.openingHelp") : nextHintLabel}
            </button>
          ) : null}
        </div>
      </div>

      <PracticeHelpPanel
        exercise={exercise}
        current={current}
        help={current.help}
        helpPolicy={helpPolicy}
        updateCurrent={updateCurrent}
        onOpenHelp={(stepKey) => {
          if (stepKey) void openStep(stepKey);
        }}
        codeInputId={codeInputId}
      />

      {state.hintKeys.length > 0 && !state.nextHintKey && !revealed ? (
        <div className="ui-surface-muted p-3 text-xs text-[rgb(var(--ui-text-muted)/0.95)]">
          {t("mobile.noMoreHints")}
        </div>
      ) : null}

      {canReveal ? (
        <div className="ui-surface-warn p-3">
          <div className="ui-title-sm">{t("mobile.revealTitle")}</div>
          <div className="mt-1 ui-meta">{t("mobile.revealWarning")}</div>
          <button
            type="button"
            className="ui-btn-secondary mt-3 min-h-10 w-full justify-center px-3 text-xs disabled:opacity-60"
            disabled={helpBusy}
            onClick={() => setConfirmReveal(true)}
          >
            {t("mobile.revealAnswer")}
          </button>
        </div>
      ) : null}

      {confirmReveal ? (
        <div
          role="alertdialog"
          aria-modal="true"
          className="ui-surface-danger p-3"
        >
          <div className="ui-title-sm">{t("mobile.revealConfirmTitle")}</div>
          <div className="mt-1 ui-meta">{t("mobile.revealConfirmBody")}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="ui-btn-secondary min-h-10 justify-center px-3 text-xs"
              onClick={() => setConfirmReveal(false)}
            >
              {t("mobile.cancel")}
            </button>
            <button
              type="button"
              className="ui-btn-ide-danger min-h-10 justify-center px-3 text-xs"
              disabled={helpBusy}
              onClick={() => void revealAnswer()}
            >
              {helpBusy ? t("mobile.openingHelp") : t("mobile.revealAnswer")}
            </button>
          </div>
        </div>
      ) : null}

      {pendingRevealCompletion ? (
        <div className="ui-surface-success p-3">
          <div className="ui-title-sm">{t("mobile.answerRevealedTitle")}</div>
          <div className="mt-1 ui-meta">{t("mobile.answerRevealedBody")}</div>
          <button
            type="button"
            className="ui-btn-primary mt-3 min-h-11 w-full justify-center px-4 text-sm"
            onClick={() => void finishRevealedSession?.()}
          >
            {t("mobile.continue")}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="ui-btn-secondary min-h-10 w-full justify-center px-3 text-xs"
        onClick={onClose}
      >
        {t("mobile.backToExercise")}
      </button>
    </div>
  );
}
