"use client";

import React from "react";
import { useTaggedT } from "@student/i18n/tagged";
import { resolvePracticeDisplayTitle } from "@/lib/practice/displayTitle";
import type { Exercise } from "@/lib/practice/types";
import type { PracticeShellProps } from "../PracticeShell";
import ResultPanel from "./ResultPanel";
import { shouldOfferAiTutor } from "@zoeskoul/learner-ui/ai-tutor/tutorContext";
import { useAiTutorRuntimeStatus } from "@/components/ai-tutor/useAiTutorRuntimeStatus";
import {
    isAiTutorFallbackRequired,
    resolveAiTutorExerciseKey,
} from "@zoeskoul/learner-ui/ai-tutor/tutorAvailability";
import {
    canRevealPracticeAnswer,
    DEFAULT_PRACTICE_HELP_POLICY,
    getFallbackPracticeHintStepKey,
} from "@/lib/practice/help/steps";

function SelectField<T extends string>({
                                           label,
                                           value,
                                           onChange,
                                           disabled,
                                           options,
                                       }: {
    label: string;
    value: string;
    onChange: (v: T) => void;
    disabled: boolean;
    options: { id: T; label: string }[];
}) {
    return (
        <div className="grid gap-2">
            <label className="ui-meta-strong">{label}</label>
            <select
                disabled={disabled}
                className="ui-select-ide mt-0 w-full"
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
            >
                {options.map((o) => (
                    <option key={String(o.id)} value={String(o.id)}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default function PracticeSidebar(
    props: PracticeShellProps & {
        canSubmitNow: boolean;
        finalized: boolean;
        attempts: number;
        outOfAttempts: boolean;
        resultBoxClass: string;
        compact?: boolean;
        onOpenHelp?: () => void;
    },
) {
    const {
        t,
        returnUrl,
        onReturn,
        experienceMode,

        isAssignmentRun,
        isSessionRun,
        isLockedRun,
        allowReveal,
        maxAttempts,
        busy,
        submitBusy,

        topicLocked,
        difficultyLocked,
        topic,
        setTopic,
        difficulty,
        setDifficulty,
        topicOptionsFixed,
        difficultyOptions,

        badge,
        current,

        canGoPrev,
        canGoNext,
        goPrev,
        goNext,
        submit,
        openHelp,
        reveal,

        answeredCount,
        correctCount,
        sessionSize,

        attempts,
        canSubmitNow,
        finalized,
        outOfAttempts,
        resultBoxClass,
        compact = false,
        onOpenHelp,
    } = props;

    const { resolve } = useTaggedT();
    const resolvedTopicOptions = React.useMemo(
        () =>
            topicOptionsFixed.map((option) => ({
                ...option,
                label: resolvePracticeDisplayTitle({
                    title: option.label,
                    titleKey: option.titleKey ?? null,
                    resolve,
                    fallback: option.label,
                }),
            })),
        [resolve, topicOptionsFixed],
    );

    const exerciseKey = resolveAiTutorExerciseKey(props.exercise, current);
    const aiTutorRuntimeStatus = useAiTutorRuntimeStatus(exerciseKey);
    const enabledHelpSteps = props.helpPolicy?.stepKeys?.length
        ? props.helpPolicy.stepKeys
        : DEFAULT_PRACTICE_HELP_POLICY.stepKeys;
    const fallbackHintStepKey = getFallbackPracticeHintStepKey(
        enabledHelpSteps,
        current?.help?.openedStepKeys ?? [],
    );
    const showFallbackHint = Boolean(
        current &&
        fallbackHintStepKey &&
        shouldOfferAiTutor(current) &&
        isAiTutorFallbackRequired(aiTutorRuntimeStatus),
    );
    const revealed = Boolean(
        current?.revealed ||
        (current?.result as any)?.revealUsed ||
        (current?.result as any)?.revealAnswer,
    );
    const revealAvailable = canRevealPracticeAnswer({
        allowReveal,
        attempts,
        solved: current?.result?.ok === true,
        revealed,
    });
    const nextBlockedByReveal = revealAvailable && !revealed;
    const helpAvailable = showFallbackHint || revealAvailable;

    const showTopicFilter =
        !isAssignmentRun &&
        topicOptionsFixed.length > 0 &&
        (!compact || !topicLocked);
    const showDifficultyFilter =
        !isAssignmentRun &&
        difficultyOptions.length > 0 &&
        (!compact || !difficultyLocked);

    return (
        <div className={compact ? "overflow-hidden" : "ui-page-surface overflow-hidden"}>

            <div className={`border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.82)] ${compact ? "p-3" : "p-4"}`}>
                { onReturn ? (
                    <div className="mb-3">
                        <button
                            type="button"
                            onClick={onReturn}
                            className="ui-btn-secondary px-3"
                        >
                            <span aria-hidden>←</span>
                            <span>
                                {isAssignmentRun
                                    ? t("summary.assignmentReturn")
                                    : t("summary.return")}
                            </span>
                        </button>
                    </div>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className={compact ? "hidden" : "mb-2 inline-flex"}>
                            <span
                                className={
                                    experienceMode === "assignment"
                                        ? "ui-pill-warn"
                                        : experienceMode === "public_challenge"
                                            ? "ui-pill-info"
                                            : experienceMode === "daily_five"
                                                ? "ui-pill-success"
                                                : "ui-pill-neutral"
                                }
                            >
                                {experienceMode === "assignment"
                                    ? "Assignment • teacher controlled"
                                    : experienceMode === "public_challenge"
                                        ? "Public challenge • exact exercise"
                                        : experienceMode === "onboarding_trial"
                                            ? "Onboarding trial • starter questions"
                                            : experienceMode === "daily_five"
                                                ? "Daily Practice • ranked free practice"
                                                : experienceMode === "standard"
                                                    ? "Subscriber practice • configurable"
                                                    : "Practice"}
                            </span>
                        </div>

                        <div className={compact ? "hidden" : "ui-title-sm"}>{t("title")}</div>
                        <div className={compact ? "hidden" : "mt-1 ui-meta"}>{t("subtitle")}</div>

                        <div className="mt-2 ui-meta">
                            {t("progress.label")}:{" "}
                            <span className="font-medium text-[rgb(var(--ui-text)/0.96)]">
                {answeredCount}/{sessionSize}
              </span>{" "}
                            • {t("progress.correct")}:{" "}
                            <span className="font-medium text-[rgb(var(--ui-text)/0.96)]">
                {correctCount}
              </span>
                        </div>

                        {current ? (
                            <div className="mt-1 ui-meta">
                                {t("progress.attempts")}:{" "}
                                <span className="font-medium text-[rgb(var(--ui-text)/0.96)]">
                  {attempts}
                </span>
                            </div>
                        ) : null}
                    </div>

                    {!compact ? (
                        <span className="ui-pill-neutral">{badge || t("status.dash")}</span>
                    ) : null}
                </div>

                <div className="mt-3 grid gap-3">
                    {showTopicFilter ? (
                        <SelectField
                            label={t("filters.topic")}
                            value={String(topic)}
                            onChange={(v) => setTopic(v as any)}
                            disabled={topicLocked}
                            options={resolvedTopicOptions as any}
                        />
                    ) : null}

                    {showDifficultyFilter ? (
                        <SelectField
                            label={t("filters.difficulty")}
                            value={String(difficulty)}
                            onChange={(v) => setDifficulty(v as any)}
                            disabled={difficultyLocked}
                            options={difficultyOptions as any}
                        />
                    ) : null}

                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="ui-btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={goPrev}
                                disabled={busy || !canGoPrev}
                            >
                                {t("buttons.prev")}
                            </button>

                            <button
                                type="button"
                                className="ui-btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => goNext()}
                                disabled={busy || !canGoNext || nextBlockedByReveal}
                            >
                                {t("buttons.next")}
                            </button>

                            <button
                                type="button"
                                className="ui-btn-primary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => submit()}
                                disabled={submitBusy || !props.exercise || finalized || outOfAttempts || !canSubmitNow}
                            >
                                <span className="inline-flex items-center gap-2">
                                    {submitBusy ? <span className="ui-quiz-spinner" aria-hidden /> : null}
                                    <span>{submitBusy ? "Submitting..." : t("buttons.submit")}</span>
                                </span>
                            </button>
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                            {compact && onOpenHelp && helpAvailable ? (
                                <button
                                    type="button"
                                    className="ui-btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={onOpenHelp}
                                    disabled={busy || !props.exercise}
                                >
                                    {revealAvailable ? t("buttons.reveal") : t("buttons.hint")}
                                </button>
                            ) : null}

                            {!compact && showFallbackHint ? (
                                <button
                                    type="button"
                                    className="ui-btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => openHelp(fallbackHintStepKey ?? undefined)}
                                    disabled={busy || !props.exercise}
                                >
                                    {t("buttons.hint")}
                                </button>
                            ) : null}

                            {!compact && revealAvailable ? (
                                <button
                                    type="button"
                                    className="ui-btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                    onClick={() => reveal()}
                                    disabled={busy || !props.exercise}
                                >
                                    {t("buttons.reveal")}
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {isLockedRun && !allowReveal ? (
                        <div className="ui-meta">{t("status.revealDisabled")}</div>
                    ) : null}
                </div>
            </div>

            <ResultPanel
                t={t}
                busy={busy}
                isLockedRun={isLockedRun}
                maxAttempts={maxAttempts}
                attempts={attempts}
                actionErr={props.actionErr}
                current={props.current}
                exercise={props.exercise as Exercise | null}
                updateCurrent={props.updateCurrent}
                resultBoxClass={resultBoxClass}
                excuseAndNext={props.excuseAndNext}
                codeInputId={props.codeInputId}
                pendingRevealCompletion={props.pendingRevealCompletion}
                finishRevealedSession={props.finishRevealedSession}
                canGoNext={props.canGoNext}
                goNext={props.goNext}
            />
        </div>
    );
}