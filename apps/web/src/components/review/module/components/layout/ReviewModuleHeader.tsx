"use client";

import React from "react";
import HeaderSlick from "@/components/HeaderSlick";
import type { HeaderGamificationVm } from "../../types";

type Props = {
    locale: string;
    toolsUiEnabled: boolean;
    showDesktopLeft: boolean;
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    onBack: () => void;
    onToggleLeftPanel: () => void;
    onToggleRightPanel: () => void;
    onResetCurrentTopic: () => void;
    onPrevTopic: () => void;
    onNextTopic: () => void;
    prevTopic: { id?: string } | null;
    nextTopic: { id?: string } | null;
    unlockAll: boolean;
    viewIsComplete: boolean;
    headerGamification: HeaderGamificationVm | null;
};

export default function ReviewModuleHeader({
                                               toolsUiEnabled,
                                               showDesktopLeft,
                                               leftCollapsed,
                                               rightCollapsed,
                                               onBack,
                                               onToggleLeftPanel,
                                               onToggleRightPanel,
                                               onResetCurrentTopic,
                                               onPrevTopic,
                                               onNextTopic,
                                               prevTopic,
                                               nextTopic,
                                               unlockAll,
                                               viewIsComplete,
                                               headerGamification,
                                           }: Props) {
    return (
        <HeaderSlick
            slot={
                <div className="flex w-full items-center justify-between gap-3">
                    <div className="inline-flex min-w-0 flex-wrap items-center gap-2 [&>button]:shrink-0">
                        <button
                            type="button"
                            onClick={onBack}
                            className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                            title="Go back"
                        >
                            ← Back
                        </button>

                        <button
                            type="button"
                            onClick={onToggleLeftPanel}
                            className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                            title="Topics"
                        >
                            {showDesktopLeft
                                ? leftCollapsed
                                    ? "Topics ▶"
                                    : "Topics ◀"
                                : "Topics"}
                        </button>

                        {toolsUiEnabled ? (
                            <button
                                type="button"
                                onClick={onToggleRightPanel}
                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                title="Tools"
                            >
                                {rightCollapsed ? "Tools ▶" : "Tools ◀"}
                            </button>
                        ) : null}

                        <button
                            type="button"
                            onClick={onResetCurrentTopic}
                            className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap hidden sm:inline-flex"
                        >
                            Reset topic
                        </button>

                        <button
                            type="button"
                            onClick={onPrevTopic}
                            className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                            disabled={!prevTopic?.id}
                            title={!prevTopic?.id ? "No previous topic" : "Previous topic"}
                        >
                            ←
                        </button>

                        <button
                            type="button"
                            onClick={onNextTopic}
                            className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                            disabled={!nextTopic?.id || (!unlockAll && !viewIsComplete)}
                            title={
                                !nextTopic?.id
                                    ? "No next topic"
                                    : !unlockAll && !viewIsComplete
                                        ? "Complete the topic to continue"
                                        : "Next topic"
                            }
                        >
                            →
                        </button>
                    </div>

                    {headerGamification ? (
                        <div className="hidden sm:flex shrink-0 items-center gap-2">
                            <div className="rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.88)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--ui-text)/0.96)]">
                                🔥 {headerGamification.currentStreak}
                            </div>

                            <div className="rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.88)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--ui-text)/0.96)]">
                                Lv {headerGamification.level}
                            </div>

                            <div className="rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.88)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--ui-text)/0.96)]">
                                {headerGamification.totalXp.toLocaleString()} XP
                            </div>
                        </div>
                    ) : null}
                </div>
            }
            isBillingStatus={false}
            brand={process.env.NEXT_PUBLIC_APP_NAME}
            badge=""
            isUser={false}
            isNav={false}
        />
    );
}