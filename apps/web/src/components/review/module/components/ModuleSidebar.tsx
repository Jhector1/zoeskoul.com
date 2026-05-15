"use client";

import React from "react";
import { cn } from "@/lib/cn";
import type {
    ReviewModule,
    ReviewModuleSection,
    ReviewTopicShape,
} from "@/lib/subjects/types";
import RingButton from "@/components/review/module/RingButton";
import { useTaggedT } from "@/i18n/tagged";

export type SidebarTopicItemVm = {
    id: string;
    slug?: string;
    label: string;
    summary: string | null;
    disabled: boolean;
    done: boolean;
    isViewing: boolean;
    isActive: boolean;
};

export type SidebarSectionItemVm = {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    order: number;
    topics: SidebarTopicItemVm[];
};

function asText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

function buildTopicItemLookup(topicItems: SidebarTopicItemVm[]) {
    const lookup = new Map<string, SidebarTopicItemVm>();

    for (const item of topicItems) {
        lookup.set(item.id, item);

        if (item.slug) {
            lookup.set(item.slug, item);
        }
    }

    return lookup;
}

function getReviewTopicLookupKey(topic: ReviewTopicShape): string {
    return String(topic.id);
}

function getSectionTitle(section: ReviewModuleSection, index: number): string {
    return (
        asText(section.title) ??
        asText(section.slug) ??
        asText(section.id) ??
        `Section ${index + 1}`
    );
}

function buildSectionItemsFromModule(
    mod: ReviewModule,
    topicItems: SidebarTopicItemVm[],
): SidebarSectionItemVm[] {
    const rawSections = Array.isArray(mod.sections) ? mod.sections : [];
    if (!rawSections.length) return [];

    const topicLookup = buildTopicItemLookup(topicItems);
    const usedTopicIds = new Set<string>();

    const sections = rawSections
        .slice()
        .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
        .map((section, sectionIndex) => {
            const topics = section.topics
                .map((topic) => {
                    const key = getReviewTopicLookupKey(topic);
                    return topicLookup.get(key) ?? null;
                })
                .filter((topic): topic is SidebarTopicItemVm => Boolean(topic));

            for (const topic of topics) {
                usedTopicIds.add(topic.id);
            }

            return {
                id: section.id,
                slug: section.slug,
                title: getSectionTitle(section, sectionIndex),
                summary: section.summary ?? section.description ?? null,
                order: section.order,
                topics,
            } satisfies SidebarSectionItemVm;
        })
        .filter((section) => section.topics.length > 0);

    const unsectionedTopics = topicItems.filter((topic) => !usedTopicIds.has(topic.id));

    if (unsectionedTopics.length > 0) {
        sections.push({
            id: "__unsectioned_topics__",
            slug: "__unsectioned_topics__",
            title: "Other topics",
            summary: null,
            order: Number.MAX_SAFE_INTEGER,
            topics: unsectionedTopics,
        });
    }

    return sections;
}

function buildFallbackSections(topicItems: SidebarTopicItemVm[]): SidebarSectionItemVm[] {
    return [
        {
            id: "__all_topics__",
            slug: "__all_topics__",
            title: "Topics",
            summary: null,
            order: 0,
            topics: topicItems,
        },
    ];
}

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
            data-testid={`review-sidebar-topic-${item.id}`}
            data-topic-id={item.id}
            data-topic-slug={item.slug ?? item.id}
            disabled={item.disabled}
            onClick={() => onGoToTopic(item.id)}
            className={cn(
                "relative block w-full max-w-full overflow-hidden text-left",
                "!rounded-md px-3 py-2.5",
                item.isViewing ? "ui-review-topic-btn-active" : "ui-review-topic-btn",
                item.disabled && "cursor-not-allowed opacity-60",
            )}
        >
            <div className="grid min-w-0 max-w-full grid-cols-[14px_minmax(0,1fr)] gap-2">
                <span
                    aria-hidden="true"
                    className={cn(
                        "mt-[7px] h-1.5 w-1.5 rounded-full",
                        item.isViewing || item.isActive
                            ? "bg-[rgb(var(--ui-accent))]"
                            : item.done
                                ? "bg-emerald-500"
                                : "bg-[rgb(var(--ui-border-strong)/0.8)]",
                    )}
                />

                <div className="min-w-0 max-w-full overflow-hidden">
                    <div className="flex min-w-0 max-w-full items-center gap-2">
                        <div className="ui-title-sm min-w-0 flex-1 truncate">
                            {item.label}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                            {item.isActive ? (
                                <span className="ui-pill-neutral shrink-0">
                                    {ui.t("current", {}, "CURRENT")}
                                </span>
                            ) : null}

                            {item.done ? (
                                <span className="shrink-0 text-[11px] font-medium text-emerald-700 dark:text-emerald-300/80">
                                    ✓
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {item.summary ? (
                        <div className="ui-review-topic-summary line-clamp-2 max-w-full overflow-hidden">
                            {item.summary}
                        </div>
                    ) : null}
                </div>
            </div>
        </button>
    );
}

const MemoSidebarTopicRow = React.memo(
    SidebarTopicRow,
    (prev, next) =>
        prev.item.id === next.item.id &&
        prev.item.slug === next.item.slug &&
        prev.item.label === next.item.label &&
        prev.item.summary === next.item.summary &&
        prev.item.disabled === next.item.disabled &&
        prev.item.done === next.item.done &&
        prev.item.isViewing === next.item.isViewing &&
        prev.item.isActive === next.item.isActive &&
        prev.onGoToTopic === next.onGoToTopic,
);

function SidebarSectionGroup({
                                 section,
                                 open,
                                 onToggle,
                                 onGoToTopic,
                             }: {
    section: SidebarSectionItemVm;
    open: boolean;
    onToggle: (sectionId: string) => void;
    onGoToTopic: (tid: string) => void;
}) {
    const ui = useTaggedT("moduleSidebarUi");

    const done = section.topics.filter((topic) => topic.done).length;
    const total = section.topics.length;

    const isCurrentSection = section.topics.some(
        (topic) => topic.isViewing || topic.isActive,
    );

    const isComplete = total > 0 && done === total;
    const isStarted = done > 0 && !isComplete;

    return (
        <div
            className={cn(
                "w-full max-w-full overflow-hidden rounded-md border transition-colors duration-200",
                "border-[rgb(var(--ui-border)/0.72)] bg-[rgb(var(--ui-surface)/0.7)]",

                isStarted &&
                "border-[rgb(var(--ui-info)/0.24)] bg-[rgb(var(--ui-info)/0.035)]",

                isComplete &&
                "border-[rgb(var(--ui-accent)/0.24)] bg-[rgb(var(--ui-accent)/0.055)]",

                isCurrentSection &&
                "border-[rgb(var(--ui-accent)/0.36)] bg-[rgb(var(--ui-accent)/0.075)]",
            )}
        >
            <button
                type="button"
                onClick={() => onToggle(section.id)}
                aria-expanded={open}
                className={cn(
                    "grid w-full max-w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-left",
                    "transition-colors duration-150 hover:bg-[rgb(var(--ui-hover)/0.72)]",
                )}
            >
                <div className="min-w-0 max-w-full overflow-hidden">
                    <div className="flex min-w-0 max-w-full items-center gap-2">
                        <span
                            aria-hidden="true"
                            className={cn(
                                "inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs",
                                "text-[rgb(var(--ui-text-muted)/0.88)] transition-transform duration-200",
                                open && "rotate-90",
                            )}
                        >
                            ▸
                        </span>

                        <span
                            aria-hidden="true"
                            className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                isComplete
                                    ? "bg-[rgb(var(--ui-accent))]"
                                    : isStarted
                                        ? "bg-[rgb(var(--ui-info))]"
                                        : "bg-[rgb(var(--ui-border-strong)/0.75)]",
                            )}
                        />

                        <div
                            className={cn(
                                "ui-title-sm min-w-0 flex-1 truncate",
                                isComplete && "text-[rgb(var(--ui-text-muted)/0.9)]",
                            )}
                        >
                            {section.title}
                        </div>

                        {isCurrentSection ? (
                            <span className="ui-pill-neutral shrink-0">
                                {ui.t("currentSection", {}, "Current")}
                            </span>
                        ) : isComplete ? (
                            <span className="ui-pill-good shrink-0">
                                {ui.t("completedSection", {}, "Done")}
                            </span>
                        ) : isStarted ? (
                            <span className="ui-pill-info shrink-0">
                                {ui.t("inProgressSection", {}, "Progress")}
                            </span>
                        ) : null}
                    </div>

                    {section.summary ? (
                        <div className="mt-1 max-w-full truncate text-xs text-[rgb(var(--ui-text-muted)/0.82)]">
                            {section.summary}
                        </div>
                    ) : null}
                </div>

                <div
                    className={cn(
                        "shrink-0 text-[11px] font-medium tabular-nums",
                        isComplete
                            ? "text-[rgb(var(--ui-accent))]"
                            : isStarted
                                ? "text-[rgb(var(--ui-info))]"
                                : "text-[rgb(var(--ui-text-muted)/0.82)]",
                    )}
                >
                    {isComplete ? "✓" : `${done}/${total}`}
                </div>
            </button>

            <div
                className={cn(
                    "grid max-w-full overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out",
                    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
            >
                <div className="min-h-0 max-w-full overflow-hidden">
                    <div className="max-w-full overflow-hidden border-t border-[rgb(var(--ui-border)/0.58)] px-2 py-2">
                        <div className="grid max-w-full gap-1.5 overflow-hidden">
                            {section.topics.map((item) => (
                                <MemoSidebarTopicRow
                                    key={item.id}
                                    item={item}
                                    onGoToTopic={onGoToTopic}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const MemoSidebarSectionGroup = React.memo(
    SidebarSectionGroup,
    (prev, next) =>
        prev.section === next.section &&
        prev.open === next.open &&
        prev.onToggle === next.onToggle &&
        prev.onGoToTopic === next.onGoToTopic,
);

function ModuleSidebar({
                           mod,
                           topicItems,
                           sectionItems,
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
    sectionItems?: SidebarSectionItemVm[];
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

    const resolvedSections = React.useMemo(() => {
        if (Array.isArray(sectionItems) && sectionItems.length > 0) {
            return sectionItems.filter((section) => section.topics.length > 0);
        }

        const fromModule = buildSectionItemsFromModule(mod, topicItems);

        if (fromModule.length > 0) {
            return fromModule;
        }

        return buildFallbackSections(topicItems);
    }, [mod, sectionItems, topicItems]);

    const currentSectionId = React.useMemo(() => {
        return (
            resolvedSections.find((section) =>
                section.topics.some((topic) => topic.isViewing || topic.isActive),
            )?.id ??
            resolvedSections[0]?.id ??
            ""
        );
    }, [resolvedSections]);

    const [openSectionId, setOpenSectionId] = React.useState<string>("");
    const lastAutoOpenedSectionRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        setOpenSectionId((prev) => {
            const validIds = new Set(resolvedSections.map((section) => section.id));
            const fallbackId = currentSectionId || resolvedSections[0]?.id || "";

            if (!fallbackId) return "";

            if (
                currentSectionId &&
                lastAutoOpenedSectionRef.current !== currentSectionId
            ) {
                return currentSectionId;
            }

            if (prev && validIds.has(prev)) {
                return prev;
            }

            return fallbackId;
        });

        if (currentSectionId && lastAutoOpenedSectionRef.current !== currentSectionId) {
            lastAutoOpenedSectionRef.current = currentSectionId;
        }
    }, [currentSectionId, resolvedSections]);

    const handleToggleSection = React.useCallback((sectionId: string) => {
        setOpenSectionId((prev) => (prev === sectionId ? "" : sectionId));
    }, []);

    return (
        <div className="ui-page-surface flex h-full min-h-0 flex-col overflow-hidden rounded-none">
            <div className="shrink-0 border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-4 py-3">
                <div className="min-w-0">
                    <div className="ui-title-md">{modTitle}</div>

                    {modSubtitle ? (
                        <div className="mt-1 ui-meta">{modSubtitle}</div>
                    ) : null}
                </div>

                <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="ui-review-progress-text">
                                {ui.t("topicsLabel", {}, "Topics")}
                            </span>

                            <span className="ui-review-progress-value">
                                {moduleProgress.done}/{moduleProgress.total}
                            </span>
                        </div>

                        <div className="ui-progress-track mt-2">
                            <div
                                className="ui-progress-fill"
                                style={{
                                    width: `${Math.round(moduleProgress.pct * 100)}%`,
                                }}
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
                            className={cn(
                                "ui-btn-secondary px-3",
                                "text-rose-700 dark:text-rose-200",
                            )}
                            title={ui.t(
                                "resetTitle",
                                {},
                                "Reset all progress in this module",
                            )}
                        >
                            {ui.t("reset", {}, "Reset Module")}
                        </button>
                    </div>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
                <div className="h-full min-h-0 overflow-y-auto p-2.5 sm:p-3">
                    <div className="grid gap-2">
                        {resolvedSections.map((section) => (
                            <MemoSidebarSectionGroup
                                key={section.id}
                                section={section}
                                open={openSectionId === section.id}
                                onToggle={handleToggleSection}
                                onGoToTopic={onGoToTopic}
                            />
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
                        <div className="ui-title-sm">
                            {ui.t("nextModule.title", {}, "Next module")}
                        </div>
                        <div className="mt-1 ui-meta">
                            {ui.t("nextModule.loading", {}, "Loading…")}
                        </div>
                    </div>
                ) : navError ? (
                    <div className="ui-review-note-danger mt-2.5">
                        <div className="ui-title-sm">
                            {ui.t("nextModule.title", {}, "Next module")}
                        </div>
                        <div className="mt-1 text-rose-700/80 dark:text-rose-200/80">
                            {ui.t(
                                "nextModule.error",
                                {},
                                "Couldn’t load navigation.",
                            )}
                        </div>
                    </div>
                ) : hasNextModule ? (
                    <div className="ui-review-note mt-2.5">
                        <div className="ui-title-sm">
                            {ui.t("nextModule.title", {}, "Next module")}
                        </div>

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
        prev.sectionItems === next.sectionItems &&
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