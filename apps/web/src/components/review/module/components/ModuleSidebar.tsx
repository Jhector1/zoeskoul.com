"use client";

import React from "react";
import { cn } from "@/lib/cn";
import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import RingButton from "@/components/review/module/RingButton";
import { isTopicComplete } from "../utils";
import { useTaggedT } from "@/i18n/tagged"; // ✅ adjust path if yours differs

export default function ModuleSidebar({
                                          mod,
                                          topics,
                                          progress,
                                          activeIdx,
                                          activeTopicId,
                                          viewTopicId,
                                          unlockAll,
                                          moduleProgress,
                                          topicUnlocked,
                                          onGoToTopic,
                                          onResetModule,
                                          onCollapse,
                                          assignmentPct,
                                          assignmentMissedPct = 0, // ✅ NEW (defaults to 0 so nothing breaks)

                                          navLoading = false,
                                          navError = false,
                                          assignmentLabel,
                                          assignmentSublabel,
                                          onAssignmentClick,
                                          hasNextModule,
                                          progressHydrated,
                                          canGoNextModule,
                                      }: {
    mod: ReviewModule;
    topics: any[];
    progress: any;
    activeIdx: number;

    activeTopicId: string;
    viewTopicId: string;

    unlockAll: boolean;
    moduleProgress: { done: number; total: number; pct: number };

    topicUnlocked: (tid: string) => boolean;
    onGoToTopic: (tid: string) => void;

    onResetModule: () => void;
    onCollapse: () => void;

    assignmentPct: number;
    assignmentMissedPct?: number; // ✅ NEW

    assignmentLabel: string;
    assignmentSublabel?: string;
    onAssignmentClick: () => void;
    progressHydrated: boolean;
    navLoading?: boolean;
    navError?: boolean;
    hasNextModule: boolean;
    canGoNextModule: boolean;
}) {
    const tt = useTaggedT(); // ✅ for "@:..."
    const ui = useTaggedT("moduleSidebarUi"); // ✅ optional UI namespace

    const modTitle = tt.resolve((mod as any)?.title ?? "");
    const modSubtitle = tt.resolve((mod as any)?.subtitle ?? null);

    return (
        <div className="h-full ui-card overflow-hidden flex flex-col">
            {/* pinned header */}
            <div className="shrink-0 p-3 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/30">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                            {modTitle}
                        </div>

                        {modSubtitle ? (
                            <div className="mt-1 text-sm text-neutral-600 dark:text-white/60">
                                {modSubtitle}
                            </div>
                        ) : null}

                        <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] font-extrabold text-neutral-500 dark:text-white/45">
                {ui.t("topicsLabel", {}, "Topics")}
              </span>
                            <span className="text-[11px] font-black tabular-nums text-neutral-700 dark:text-white/70">
                {moduleProgress.done}/{moduleProgress.total}
              </span>
                        </div>

                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200/70 dark:bg-white/10">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500/70 via-emerald-500/60 to-teal-400/60 dark:from-emerald-200/30 dark:via-emerald-200/25 dark:to-teal-200/25"
                                style={{ width: `${Math.round(moduleProgress.pct * 100)}%` }}
                            />
                        </div>

                        {unlockAll ? (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-800 dark:border-amber-300/25 dark:bg-amber-200/10 dark:text-amber-200">
                                {ui.t("unlockEnabled", {}, "UNLOCK ENABLED")}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="ui-btn ui-btn-secondary px-3 py-2 text-[11px] font-extrabold"
                            title={ui.t("collapseTitle", {}, "Collapse sidebar")}
                        >
                            ◀
                        </button>

                        <button
                            type="button"
                            onClick={onResetModule}
                            className={cn(
                                "ui-btn ui-btn-secondary",
                                "px-3 py-2 text-[11px] font-extrabold",
                                "text-rose-700 dark:text-rose-200",
                            )}
                            title={ui.t("resetTitle", {}, "Reset all progress in this module")}
                        >
                            {ui.t("reset", {}, "Reset")}
                        </button>
                    </div>
                </div>
            </div>

            {/* scroll body */}
            <div className="flex-1 overflow-auto p-3">
                <div className="grid gap-2">
                    {topics.map((t, idx) => {
                        const isEarlierOrActive = idx <= activeIdx;
                        const canGoForward = topicUnlocked(t.id);
                        const disabled = unlockAll ? false : !isEarlierOrActive && !canGoForward;

                        const doneTopic = progressHydrated
                            ? isTopicComplete((t.cards ?? []) as ReviewCard[], (progress as any)?.topics?.[t.id])
                            : false;

                        const isViewing = viewTopicId === t.id;
                        const isActive = activeTopicId === t.id;

                        // ✅ resolve topic strings (may be "@:topics....")
                        const topicLabel = tt.resolve(t.label ?? "");
                        const topicSummary = tt.resolve(t.summary ?? null);

                        return (
                            <button
                                type="button"
                                key={t.id}
                                disabled={disabled}
                                onClick={() => onGoToTopic(t.id)}
                                className={cn(
                                    "w-full text-left rounded-xl border px-3 py-2 transition",
                                    disabled && "opacity-60 cursor-not-allowed",
                                    isViewing
                                        ? "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10"
                                        : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]",
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-extrabold">{topicLabel}</div>

                                    <div className="flex items-center gap-2">
                                        {isActive ? (
                                            <span className="ui-pill ui-pill--neutral">
                        {ui.t("current", {}, "CURRENT")}
                      </span>
                                        ) : null}

                                        {doneTopic ? (
                                            <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-300/80">
                        ✓
                      </span>
                                        ) : null}
                                    </div>
                                </div>

                                {topicSummary ? (
                                    <div className="mt-1 text-xs text-neutral-600 dark:text-white/55">
                                        {topicSummary}
                                    </div>
                                ) : null}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-3">
                    <RingButton
                        pct={assignmentPct}
                        missedPct={assignmentMissedPct}
                        label={tt.resolve(assignmentLabel)}
                        sublabel={tt.resolve(assignmentSublabel ?? null) || undefined}
                        onClick={onAssignmentClick}
                        disabled={false}
                    />
                </div>

                {navLoading ? (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3 text-xs dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="font-extrabold text-neutral-700 dark:text-white/70">
                            {ui.t("nextModule.title", {}, "Next module")}
                        </div>
                        <div className="mt-1 text-neutral-600 dark:text-white/55">
                            {ui.t("nextModule.loading", {}, "Loading…")}
                        </div>
                    </div>
                ) : navError ? (
                    <div className="mt-3 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-xs dark:border-rose-300/20">
                        <div className="font-extrabold text-rose-700 dark:text-rose-200">
                            {ui.t("nextModule.title", {}, "Next module")}
                        </div>
                        <div className="mt-1 text-rose-700/80 dark:text-rose-200/80">
                            {ui.t("nextModule.error", {}, "Couldn’t load navigation.")}
                        </div>
                    </div>
                ) : hasNextModule ? (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3 text-xs dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="font-extrabold text-neutral-700 dark:text-white/70">
                            {ui.t("nextModule.title", {}, "Next module")}
                        </div>
                        <div className="mt-1 text-neutral-600 dark:text-white/55">
                            {canGoNextModule
                                ? unlockAll
                                    ? ui.t("nextModule.unlocked", {}, "Unlocked.")
                                    : ui.t("nextModule.unlockedAfterAssignment", {}, "Unlocked after assignment.")
                                : ui.t("nextModule.locked", {}, "Finish topics + assignment to unlock.")}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}