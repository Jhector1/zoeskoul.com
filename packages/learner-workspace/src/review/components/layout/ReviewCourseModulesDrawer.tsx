"use client";

import React from "react";
import ProgressRing from "@zoeskoul/learner-ui/components/ProgressRing";
import { cn } from "@zoeskoul/learner-ui/lib/cn";

import type { CourseModuleNavItem } from "../../hooks/useModuleNav";
import MobileDrawer from "./MobileDrawer";

export type ReviewCourseModulesDrawerLabels = {
    title: string;
    kicker: string;
    description: string;
    current: string;
    locked: string;
    currentDescription: string;
    lockedDescription: string;
    openDescription: string;
    loading: string;
    error: string;
    empty: string;
};

export type ReviewCourseModulesDrawerProps = {
    open: boolean;
    reduceMotion: boolean;
    onClose: () => void;
    modules: CourseModuleNavItem[];
    loading: boolean;
    error: boolean;
    onSelectModule: (module: CourseModuleNavItem) => void | Promise<void>;
};

type SharedProps = ReviewCourseModulesDrawerProps & {
    labels: ReviewCourseModulesDrawerLabels;
};

function ModuleRow({
    item,
    labels,
    onSelect,
}: {
    item: CourseModuleNavItem;
    labels: ReviewCourseModulesDrawerLabels;
    onSelect: (module: CourseModuleNavItem) => void | Promise<void>;
}) {
    const [pending, setPending] = React.useState(false);

    const handleClick = React.useCallback(async () => {
        if (pending) return;

        if (item.current) {
            await onSelect(item);
            return;
        }

        setPending(true);
        try {
            await onSelect(item);
        } catch {
            setPending(false);
        }
    }, [item, onSelect, pending]);

    return (
        <button
            type="button"
            data-testid={`review-course-module-${item.slug}`}
            aria-current={item.current ? "page" : undefined}
            aria-busy={pending || undefined}
            onClick={() => void handleClick()}
            className={cn(
                "group flex min-h-[74px] items-start gap-3 py-3",
                item.current ? "ui-review-topic-btn-active" : "ui-review-topic-btn",
                pending && "cursor-wait opacity-60",
            )}
        >
            <ProgressRing pct={item.progressPct} size="sm">
                <span
                    className={cn(
                        item.current && "text-[rgb(var(--ui-accent)/1)]",
                        item.locked && "text-[rgb(var(--ui-warn)/1)]",
                    )}
                >
                    {item.index + 1}
                </span>
            </ProgressRing>

            <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                    <span className="ui-title-sm min-w-0 leading-snug">
                        {item.title}
                    </span>
                    {item.current ? (
                        <span className="ui-pill-neutral shrink-0">
                            {labels.current}
                        </span>
                    ) : item.locked ? (
                        <span className="ui-pill-warn shrink-0 uppercase tracking-wide">
                            {labels.locked}
                        </span>
                    ) : null}
                </span>

                <span className="ui-meta mt-1 block text-xs">
                    {item.current
                        ? labels.currentDescription
                        : item.locked
                            ? labels.lockedDescription
                            : labels.openDescription}
                </span>
            </span>

            <span
                aria-hidden="true"
                className="ui-review-module-arrow"
            >
                {item.current ? "✓" : "→"}
            </span>
        </button>
    );
}

export default function ReviewCourseModulesDrawer({
    open,
    reduceMotion,
    onClose,
    modules,
    loading,
    error,
    onSelectModule,
    labels,
}: SharedProps) {
    return (
        <MobileDrawer
            open={open}
            side="left"
            title={labels.title}
            reduceMotion={reduceMotion}
            onClose={onClose}
        >
            <div
                className="space-y-3 p-3"
                data-testid="review-course-modules-drawer"
            >
                <div className="ui-surface-muted px-3 py-2.5">
                    <div className="ui-kicker">{labels.kicker}</div>
                    <div className="ui-title-sm mt-1 leading-snug">
                        {labels.description}
                    </div>
                </div>

                {loading ? (
                    <div
                        className="grid gap-2"
                        aria-label={labels.loading}
                        role="status"
                    >
                        {[0, 1, 2, 3].map((item) => (
                            <div
                                key={item}
                                className="ui-review-module-skeleton"
                            />
                        ))}
                    </div>
                ) : error ? (
                    <div
                        role="alert"
                        className="ui-review-note-danger"
                    >
                        {labels.error}
                    </div>
                ) : modules.length > 0 ? (
                    <div className="grid gap-2">
                        {modules.map((item) => (
                            <ModuleRow
                                key={item.slug}
                                item={item}
                                labels={labels}
                                onSelect={onSelectModule}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="ui-review-note">
                        {labels.empty}
                    </div>
                )}
            </div>
        </MobileDrawer>
    );
}
