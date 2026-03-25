// src/components/practice/shell/PracticeView.tsx
"use client";

import React from "react";
import ConfirmResetModal from "../ConfirmResetModal";
import type { PracticeShellProps } from "../PracticeShell";
import PracticeSidebar from "./PracticeSidebar";
import QuestionPanel from "./QuestionPanel";
import type { UseConceptExplainResult } from "../hooks/useConceptExplain";

export default function PracticeView(
    props: PracticeShellProps & {
        canSubmitNow: boolean;
        finalized: boolean;
        attempts: number;
        outOfAttempts: boolean;
        resultBoxClass: string;
        concept: UseConceptExplainResult;
    },
) {
    const {
        t,
        confirmOpen,
        applyPendingChange,
        cancelPendingChange,
        answeredCount,
        sessionSize,

        canSubmitNow,
        finalized,
        attempts,
        outOfAttempts,
        resultBoxClass,
        concept,
    } = props;

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">
            {confirmOpen ? (
                <ConfirmResetModal
                    open={confirmOpen}
                    title={t("confirm.title")}
                    description={`${t("confirm.subtitle")} ${t("confirm.progressLine", {
                        answered: answeredCount,
                        sessionSize,
                    })}`}
                    confirmText={t("confirm.restart")}
                    cancelText={t("confirm.keep")}
                    danger={true}
                    onConfirm={applyPendingChange}
                    onClose={cancelPendingChange}
                />
            ) : null}

            <div className="ui-container py-4 md:py-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
                    <div className="lg:sticky lg:top-6 lg:self-start">
                        <PracticeSidebar
                            {...props}
                            canSubmitNow={canSubmitNow}
                            finalized={finalized}
                            attempts={attempts}
                            outOfAttempts={outOfAttempts}
                            resultBoxClass={resultBoxClass}
                            concept={concept}
                        />
                    </div>

                    <QuestionPanel {...props} />
                </div>
            </div>
        </div>
    );
}