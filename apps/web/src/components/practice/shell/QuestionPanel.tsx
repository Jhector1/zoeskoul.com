"use client";

import React, { useMemo } from "react";
import ExerciseRenderer from "../ExerciseRenderer";
import type { PracticeShellProps } from "../PracticeShell";
import type { Exercise } from "@/lib/practice/types";
import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";

export default function QuestionPanel(props: PracticeShellProps) {
    const {
        t,
        exercise,
        busy,
        loadErr,
        current,
        retryLoad,
        padRef,
        updateCurrent,
        isAssignmentRun,
        maxAttempts,
        skipLoadError,
    } = props;

    const { raw } = useTaggedT();

    const ex = useMemo(() => {
        if (!exercise) return null;
        return resolveDeepTagged(exercise, (key) => raw(key, "")) as Exercise;
    }, [exercise, raw]);

    return (
        <div className="ui-page-surface overflow-hidden">
            <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.82)] p-4">
                <div className="ui-title-sm">
                    {ex?.title ?? (busy ? t("status.loadingDots") : t("status.dash"))}
                </div>
            </div>

            <div className="p-4">
                {loadErr ? (
                    <div className="ui-surface-danger p-3 text-sm">
                        <div className="ui-title-sm">{t("loadError.title")}</div>
                        <div className="mt-1 ui-meta-strong">{loadErr}</div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="ui-btn-secondary px-3"
                                onClick={retryLoad}
                                disabled={busy}
                            >
                                {t("buttons.retry")}
                            </button>

                            <button
                                type="button"
                                className="ui-btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => skipLoadError?.()}
                                disabled={busy || !skipLoadError}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                ) : !current || !ex ? (
                    <div className="ui-meta">
                        {busy ? t("status.loading") : t("status.clickNextToStart")}
                    </div>
                ) : (
                    // <></>
                    <ExerciseRenderer
                        exercise={ex}
                        current={current}
                        busy={busy}
                        isAssignmentRun={isAssignmentRun}
                        maxAttempts={maxAttempts}
                        padRef={padRef}
                        updateCurrent={updateCurrent}
                        showPrompt={true}
                    />
                )}
            </div>

            <div className="border-t border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] p-3 ui-meta">
                {t("questionPanel.footerTip")}
            </div>
        </div>
    );
}