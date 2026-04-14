"use client";

import React from "react";
import { cn } from "@/lib/cn";
import type { ReviewModule } from "@/lib/subjects/types";
import RingButton from "@/components/review/module/RingButton";
import { useTaggedT } from "@/i18n/tagged";

export type SidebarTopicItemVm = {
    id: string;
    label: string;
    summary: string | null;
    disabled: boolean;
    done: boolean;
    isViewing: boolean;
    isActive: boolean;
};

function SidebarTopicRow({
                             item,
                             onGoToTopic,
                         }: {
    item: SidebarTopicItemVm;
    onGoToTopic: (tid: string) => void;
}) {
    const ui = useTaggedT("moduleSidebarUi");

    return (
        <button
            type="button"
            disabled={item.disabled}
            onClick={() => onGoToTopic(item.id)}
            className={cn(
                item.isViewing ? "ui-review-topic-btn-active" : "ui-review-topic-btn",
                item.disabled && "cursor-not-allowed opacity-60",
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="ui-title-sm">{item.label}</div>

                <div className="flex items-center gap-2">
                    {item.isActive ? (
                        <span className="ui-pill-neutral">{ui.t("current", {}, "CURRENT")}</span>
                    ) : null}

                    {item.done ? (
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300/80">
              ✓
            </span>
                    ) : null}
                </div>
            </div>

            {item.summary ? <div className="ui-review-topic-summary">{item.summary}</div> : null}
        </button>
    );
}

const MemoSidebarTopicRow = React.memo(
    SidebarTopicRow,
    (prev, next) =>
        prev.item.id === next.item.id &&
        prev.item.label === next.item.label &&
        prev.item.summary === next.item.summary &&
        prev.item.disabled === next.item.disabled &&
        prev.item.done === next.item.done &&
        prev.item.isViewing === next.item.isViewing &&
        prev.item.isActive === next.item.isActive &&
        prev.onGoToTopic === next.onGoToTopic,
);

function ModuleSidebar({
                           mod,
                           topicItems,
                           unlockAll,
                           moduleProgress,
                           onGoToTopic,
                           onResetModule,
                           onCollapse,
                           assignmentPct,
                           assignmentMissedPct = 0,
                           navLoading = false,
                           navError = false,
                           assignmentLabel,
                           assignmentSublabel,
                           onAssignmentClick,
                           hasNextModule,
                           canGoNextModule,
                       }: {
    mod: ReviewModule;
    topicItems: SidebarTopicItemVm[];
    unlockAll: boolean;
    moduleProgress: { done: number; total: number; pct: number };
    onGoToTopic: (tid: string) => void;
    onResetModule: () => void;
    onCollapse: () => void;
    assignmentPct: number;
    assignmentMissedPct?: number;
    assignmentLabel: string;
    assignmentSublabel?: string;
    onAssignmentClick: () => void;
    navLoading?: boolean;
    navError?: boolean;
    hasNextModule: boolean;
    canGoNextModule: boolean;
}) {
    const ui = useTaggedT("moduleSidebarUi");

    const modTitle = String((mod as any)?.title ?? "");
    const modSubtitle = ((mod as any)?.subtitle ?? null) as string | null;

    return (
        <div className="ui-page-surface flex h-full min-h-0 flex-col overflow-hidden rounded-none">
            <div className="shrink-0 border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-3">
                <div className="min-w-0">
                    <div className="ui-title-md">{modTitle}</div>
                    {modSubtitle ? <div className="mt-1 ui-meta">{modSubtitle}</div> : null}
                </div>

                <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="ui-review-progress-text">{ui.t("topicsLabel", {}, "Topics")}</span>
                            <span className="ui-review-progress-value">
                {moduleProgress.done}/{moduleProgress.total}
              </span>
                        </div>

                        <div className="ui-progress-track mt-2">
                            <div
                                className="ui-progress-fill"
                                style={{ width: `${Math.round(moduleProgress.pct * 100)}%` }}
                            />
                        </div>

                        {unlockAll ? (
                            <div className="ui-pill-warn mt-2.5">
                                {ui.t("unlockEnabled", {}, "UNLOCK ENABLED")}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="ui-btn-secondary px-3"
                            title={ui.t("collapseTitle", {}, "Collapse sidebar")}
                        >
                            ◀
                        </button>

                        <button
                            type="button"
                            onClick={onResetModule}
                            className={cn("ui-btn-secondary px-3", "text-rose-700 dark:text-rose-200")}
                            title={ui.t("resetTitle", {}, "Reset all progress in this module")}
                        >
                            {ui.t("reset", {}, "Reset")}
                        </button>
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
                <div className="h-full min-h-0 overflow-y-auto p-2.5 sm:p-3">
                    <div className="grid gap-2">
                        {topicItems.map((item) => (
                            <MemoSidebarTopicRow key={item.id} item={item} onGoToTopic={onGoToTopic} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="shrink-0 border-t border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] p-2.5 sm:p-3">
                <RingButton
                    pct={assignmentPct}
                    missedPct={assignmentMissedPct}
                    label={assignmentLabel}
                    sublabel={assignmentSublabel || undefined}
                    onClick={onAssignmentClick}
                    disabled={false}
                />

                {navLoading ? (
                    <div className="ui-review-note mt-2.5">
                        <div className="ui-title-sm">{ui.t("nextModule.title", {}, "Next module")}</div>
                        <div className="mt-1 ui-meta">{ui.t("nextModule.loading", {}, "Loading…")}</div>
                    </div>
                ) : navError ? (
                    <div className="ui-review-note-danger mt-2.5">
                        <div className="ui-title-sm">{ui.t("nextModule.title", {}, "Next module")}</div>
                        <div className="mt-1 text-rose-700/80 dark:text-rose-200/80">
                            {ui.t("nextModule.error", {}, "Couldn’t load navigation.")}
                        </div>
                    </div>
                ) : hasNextModule ? (
                    <div className="ui-review-note mt-2.5">
                        <div className="ui-title-sm">{ui.t("nextModule.title", {}, "Next module")}</div>
                        <div className="mt-1 ui-meta">
                            {canGoNextModule
                                ? unlockAll
                                    ? ui.t("nextModule.unlocked", {}, "Unlocked.")
                                    : ui.t(
                                        "nextModule.unlockedAfterAssignment",
                                        {},
                                        "Unlocked after assignment.",
                                    )
                                : ui.t(
                                    "nextModule.locked",
                                    {},
                                    "Finish topics + assignment to unlock.",
                                )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default React.memo(
    ModuleSidebar,
    (prev, next) =>
        prev.mod === next.mod &&
        prev.topicItems === next.topicItems &&
        prev.unlockAll === next.unlockAll &&
        prev.moduleProgress === next.moduleProgress &&
        prev.onGoToTopic === next.onGoToTopic &&
        prev.onResetModule === next.onResetModule &&
        prev.onCollapse === next.onCollapse &&
        prev.assignmentPct === next.assignmentPct &&
        prev.assignmentMissedPct === next.assignmentMissedPct &&
        prev.assignmentLabel === next.assignmentLabel &&
        prev.assignmentSublabel === next.assignmentSublabel &&
        prev.onAssignmentClick === next.onAssignmentClick &&
        prev.navLoading === next.navLoading &&
        prev.navError === next.navError &&
        prev.hasNextModule === next.hasNextModule &&
        prev.canGoNextModule === next.canGoNextModule,
);