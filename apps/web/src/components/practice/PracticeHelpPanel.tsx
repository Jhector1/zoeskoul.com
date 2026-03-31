"use client";

import React from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import type { Exercise } from "@/lib/practice/types";
import type { PracticeHelpState, QItem } from "@/lib/practice/uiTypes";
import RevealAnswerCard from "@/components/practice/RevealAnswerCard";
import { useTaggedT } from "@/i18n/tagged";

export default function PracticeHelpPanel({
                                              exercise,
                                              current,
                                              help,
                                              updateCurrent,
                                          }: {
    exercise: Exercise | null;
    current: QItem;
    help: PracticeHelpState | null | undefined;
    updateCurrent: (patch: Partial<QItem>) => void;
}) {
    const tt = useTaggedT();

    if (!help?.openedStepKeys?.length) return null;

    return (
        <div className="mt-3 grid gap-3">
            {help.openedStepKeys.map((stepKey) => {
                const entry = help.entries?.[stepKey];
                if (!entry) return null;

                const resolvedContent =
                    typeof entry.content === "string"
                        ? tt.resolve(entry.content, entry.content)
                        : null;

                const resolvedLabel =
                    typeof entry.label === "string"
                        ? tt.resolve(entry.label, entry.label)
                        : stepKey;

                return (
                    <div key={stepKey} className="ui-surface-muted p-3">
                        <div className="mb-2 ui-meta-strong">{resolvedLabel}</div>

                        {resolvedContent ? (
                            <div className="ui-text">
                                <MathMarkdown
                                    content={resolvedContent}
                                    className="max-w-none"
                                />
                            </div>
                        ) : null}

                        {entry.reveal ? (
                            <div className="mt-3">
                                <RevealAnswerCard
                                    exercise={exercise}
                                    current={current}
                                    reveal={entry.reveal}
                                    updateCurrent={updateCurrent}
                                />
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}