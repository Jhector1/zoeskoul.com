"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, CheckCircle2, Lock, Sparkles } from "lucide-react";

import { cn } from "@/lib/cn";
import { useReviewProgressMany } from "@/components/review/module/hooks/useReviewProgressMany";
import { ROUTES } from "@/utils";
import { buildBillingHref } from "@/lib/billing/moduleAccess";
import NavButton from "@/components/ui/NavButton";

type ModuleRow = {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    order: number | null;
    weekStart: number | null;
    weekEnd: number | null;
};

type SectionRow = {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    order: number | null;
    moduleId: string | null;
};

export type ModuleAccessView = {
    ok: boolean;
    paid: boolean;
    reason: string;
};

type Props = {
    locale: string;
    subjectSlug: string;
    subjectTitle: string;
    subjectDescription: string | null;
    modules: ModuleRow[];
    sections: SectionRow[];
    topicIdsByModuleDbId: Record<string, string[]>;
    topicIdsBySectionId: Record<string, string[]>;
    canUnlockAll?: boolean;
    accessByModuleSlug?: Record<string, ModuleAccessView>;
};

function sortByOrderThenSlug<T extends { order: number | null; slug: string }>(a: T, b: T) {
    const ao = a.order ?? 0;
    const bo = b.order ?? 0;
    return ao - bo || a.slug.localeCompare(b.slug);
}

function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

function countMatches(topicKeys: string[], completed?: Set<string> | null) {
    if (!topicKeys.length || !completed?.size) return 0;

    let n = 0;
    for (const k of topicKeys) {
        if (completed.has(k)) n++;
    }
    return n;
}

function Surface({
                     children,
                     className,
                     tone = "default",
                 }: {
    children: React.ReactNode;
    className?: string;
    tone?: "default" | "page" | "muted";
}) {
    return (
        <div
            className={cn(
                tone === "page"
                    ? "ui-page-surface"
                    : tone === "muted"
                        ? "ui-surface-muted"
                        : "ui-surface",
                className,
            )}
        >
            {children}
        </div>
    );
}

function StatusPill({
                        tone,
                        children,
                    }: {
    tone: "neutral" | "good" | "warn" | "info" | "danger";
    children: React.ReactNode;
}) {
    const cls =
        tone === "good"
            ? "ui-pill-good"
            : tone === "warn"
                ? "ui-pill-warn"
                : tone === "info"
                    ? "ui-pill-info"
                    : tone === "danger"
                        ? "ui-pill-danger"
                        : "ui-pill-neutral";

    return <span className={cls}>{children}</span>;
}

function ProgressBar({ pct }: { pct: number }) {
    const safePct = clamp01(pct);

    return (
        <div className="ui-progress-track h-1.5">
            <div
                className="ui-progress-fill"
                style={{ width: `${Math.round(safePct * 100)}%` }}
            />
        </div>
    );
}

function DisabledAction({
                            children,
                            fullWidth = false,
                        }: {
    children: React.ReactNode;
    fullWidth?: boolean;
}) {
    return (
        <span className={cn("ui-btn-disabled", fullWidth && "w-full sm:w-auto")}>
            <span>{children}</span>
        </span>
    );
}

function getActionButtonClass(
    variant: "primary" | "secondary" | "premium" = "primary",
    fullWidth = false,
) {
    const cls =
        variant === "premium"
            ? "ui-btn-premium"
            : variant === "secondary"
                ? "ui-btn-secondary"
                : "ui-btn-primary";

    return cn(
        cls,
        "inline-flex items-center justify-center gap-2",
        fullWidth && "w-full sm:w-auto",
    );
}

function ModuleIcon({
                        idx,
                        completed,
                        locked,
                    }: {
    idx: number;
    completed?: boolean;
    locked?: boolean;
}) {
    return (
        <div
            className={cn(
                "ui-icon-box h-8 w-8 rounded-full text-[11px]",
                completed &&
                "border-[rgb(var(--ui-accent)/0.20)] bg-[rgb(var(--ui-accent)/0.10)] text-[rgb(var(--ui-accent)/1)]",
                locked &&
                "border-[rgb(var(--ui-border)/0.78)] bg-[rgb(var(--ui-surface-2)/0.92)] text-[rgb(var(--ui-text-soft)/0.9)]",
            )}
            aria-hidden
        >
            {completed ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
            ) : locked ? (
                <Lock className="h-3.5 w-3.5" />
            ) : (
                <span className="font-medium tabular-nums">{idx + 1}</span>
            )}
        </div>
    );
}

export default function SubjectModulesClient(props: Props) {
    const t = useTranslations("subjectModulesUi");

    const {
        locale,
        subjectSlug,
        subjectTitle,
        subjectDescription,
        modules,
        sections,
        topicIdsByModuleDbId,
        canUnlockAll = false,
        accessByModuleSlug,
    } = props;

    const unlockAll = Boolean(canUnlockAll);
    const sortedModules = useMemo(() => modules.slice().sort(sortByOrderThenSlug), [modules]);

    const sectionsByModuleDbId = useMemo(() => {
        const map = new Map<string, SectionRow[]>();

        for (const s of sections) {
            const key = String(s.moduleId ?? "no-module");
            map.set(key, [...(map.get(key) ?? []), s]);
        }

        for (const [key, arr] of map) {
            arr.sort(sortByOrderThenSlug);
            map.set(key, arr);
        }

        return map;
    }, [sections]);

    const moduleIds = useMemo(() => sortedModules.map((m) => m.slug), [sortedModules]);

    const { loading: progressLoading, byModuleId: progByModuleSlug } = useReviewProgressMany({
        subjectSlug,
        locale,
        moduleIds,
        enabled: moduleIds.length > 0,
        refreshMs: 0,
    });

    const unlockedBySlug = useMemo(() => {
        const set = new Set<string>();

        if (unlockAll) {
            for (const m of sortedModules) set.add(m.slug);
            return set;
        }

        for (let i = 0; i < sortedModules.length; i++) {
            const cur = sortedModules[i];

            if (i === 0) {
                set.add(cur.slug);
                continue;
            }

            const prev = sortedModules[i - 1];
            const prevDone = Boolean(progByModuleSlug[prev.slug]?.moduleCompleted);
            if (prevDone) set.add(cur.slug);
        }

        return set;
    }, [sortedModules, progByModuleSlug, unlockAll]);

    const subjectStats = useMemo(() => {
        let totalTopics = 0;
        let doneTopics = 0;
        let completedModules = 0;

        for (const m of sortedModules) {
            const mp = progByModuleSlug[m.slug];
            if (mp?.moduleCompleted) completedModules++;

            const moduleTopicKeys = topicIdsByModuleDbId[m.id] ?? [];
            totalTopics += moduleTopicKeys.length;

            const direct = countMatches(moduleTopicKeys, mp?.completedTopicKeys);
            const completedSize = mp?.completedTopicKeys?.size ?? 0;

            const fallback =
                direct === 0 && moduleTopicKeys.length > 0 && completedSize > 0
                    ? Math.min(moduleTopicKeys.length, completedSize)
                    : direct;

            doneTopics += fallback;
        }

        const pct = totalTopics > 0 ? clamp01(doneTopics / totalTopics) : completedModules ? 1 : 0;

        return {
            totalTopics,
            doneTopics,
            pct,
            totalModules: sortedModules.length,
            completedModules,
        };
    }, [sortedModules, progByModuleSlug, topicIdsByModuleDbId]);

    const backHref = `/${encodeURIComponent(locale)}/subjects`;
    const modulesListPath = `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(subjectSlug)}/modules`;

    return (
        <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)] text-[rgb(var(--ui-text)/1)]">
            <div className="ui-container py-4 sm:py-5 md:py-6">
                <div className="mx-auto max-w-4xl space-y-3">
                    <Surface tone="page" className="p-4 sm:p-5">
                        <Link
                            href={backHref}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[rgb(var(--ui-text-muted)/0.88)] transition hover:text-[rgb(var(--ui-text)/1)]"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            {t("changeSubject")}
                        </Link>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="ui-kicker">{t("kickerSubject")}</div>
                            {unlockAll ? <StatusPill tone="warn">{t("unlockEnabled")}</StatusPill> : null}
                            {progressLoading ? <StatusPill tone="neutral">{t("syncing")}</StatusPill> : null}
                        </div>

                        <h1 className="ui-title-lg mt-2 text-xl sm:text-2xl">{subjectTitle}</h1>

                        {subjectDescription ? (
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.92)]">
                                {subjectDescription}
                            </p>
                        ) : null}

                        <div className="mt-4 grid gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="ui-meta">{t("overallProgress")}</div>
                                <div className="ui-meta-strong tabular-nums">
                                    {progressLoading
                                        ? t("syncing")
                                        : `${subjectStats.doneTopics}/${subjectStats.totalTopics} • ${subjectStats.completedModules}/${subjectStats.totalModules} modules`}
                                </div>
                            </div>

                            <ProgressBar pct={subjectStats.pct} />
                        </div>
                    </Surface>

                    {sortedModules.length ? (
                        <div className="space-y-2">
                            {sortedModules.map((m, idx) => {
                                const modSections = sectionsByModuleDbId.get(String(m.id)) ?? [];
                                const mp = progByModuleSlug[m.slug];

                                const sequentialUnlocked = unlockedBySlug.has(m.slug);
                                const seqLocked = !unlockAll && !sequentialUnlocked && idx !== 0;

                                const access = accessByModuleSlug?.[m.slug] ?? {
                                    ok: true,
                                    paid: false,
                                    reason: "unknown",
                                };

                                const paywallLocked = !unlockAll && !access.ok;
                                const showPremium = paywallLocked && !seqLocked;

                                const completed = Boolean(mp?.moduleCompleted);

                                const moduleTopicKeys = topicIdsByModuleDbId[m.id] ?? [];
                                const totalTopics = moduleTopicKeys.length;

                                const directDone = countMatches(moduleTopicKeys, mp?.completedTopicKeys);
                                const completedSize = mp?.completedTopicKeys?.size ?? 0;

                                const doneTopics =
                                    directDone === 0 && totalTopics > 0 && completedSize > 0
                                        ? Math.min(totalTopics, completedSize)
                                        : directDone;

                                const modulePct =
                                    totalTopics > 0 ? clamp01(doneTopics / totalTopics) : completed ? 1 : 0;

                                const hasAnyProgress = completedSize > 0 || doneTopics > 0;

                                const moduleHref = hasAnyProgress
                                    ? ROUTES.learningPath(subjectSlug, m.slug)
                                    : ROUTES.moduleIntro(subjectSlug, m.slug);

                                const billingHref = buildBillingHref({
                                    locale,
                                    next: moduleHref,
                                    back: modulesListPath,
                                    reason: "module",
                                    subject: subjectSlug,
                                    module: m.slug,
                                });

                                const ctaLabel = showPremium
                                    ? access.reason === "requires_login"
                                        ? t("cta.signInToUnlock")
                                        : t("cta.unlock")
                                    : completed
                                        ? t("cta.review")
                                        : hasAnyProgress
                                            ? t("cta.continue")
                                            : t("cta.start");

                                const statusText = completed
                                    ? t("pillCompleted")
                                    : seqLocked
                                        ? t("pillLocked")
                                        : showPremium
                                            ? t("pillPremium")
                                            : hasAnyProgress
                                                ? t("pillInProgress")
                                                : t("pillNotStarted");

                                const pillTone: "neutral" | "good" | "warn" =
                                    completed ? "good" : showPremium || hasAnyProgress ? "warn" : "neutral";

                                return (
                                    <Surface
                                        key={m.slug}
                                        className={cn(
                                            "p-3 sm:p-4 transition-colors",
                                            !seqLocked &&
                                            "hover:border-[rgb(var(--ui-border-strong)/0.72)] hover:bg-[rgb(var(--ui-surface)/0.98)]",
                                            completed &&
                                            "border-[rgb(var(--ui-accent)/0.18)] bg-[rgb(var(--ui-surface)/0.96)]",
                                        )}
                                    >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start gap-3">
                                                    <ModuleIcon idx={idx} completed={completed} locked={seqLocked} />

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h2 className="ui-title-sm min-w-0 truncate text-sm sm:text-[15px]">
                                                                {m.title}
                                                            </h2>

                                                            <StatusPill tone={pillTone}>{statusText}</StatusPill>

                                                            {showPremium ? (
                                                                <Sparkles className="h-3.5 w-3.5 text-[rgb(var(--ui-warn)/1)]" />
                                                            ) : null}
                                                        </div>

                                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[rgb(var(--ui-text-muted)/0.88)]">
                                                            <span>{modSections.length} sections</span>
                                                            <span>
                                                                {totalTopics
                                                                    ? `${doneTopics}/${totalTopics} topics`
                                                                    : t("noTopics")}
                                                            </span>

                                                            {(m.weekStart != null || m.weekEnd != null) && (
                                                                <span className="tabular-nums">
                                                                    Weeks {m.weekStart ?? "?"}–{m.weekEnd ?? "?"}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {m.description ? (
                                                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.82)]">
                                                                {m.description}
                                                            </p>
                                                        ) : null}

                                                        <div className="mt-3 space-y-1.5">
                                                            <div className="flex items-center justify-between gap-2 text-[11px]">
                                                                <span className="text-[rgb(var(--ui-text-muted)/0.84)]">
                                                                    {totalTopics
                                                                        ? t("topicsComplete", {
                                                                            done: doneTopics,
                                                                            total: totalTopics,
                                                                        })
                                                                        : completed
                                                                            ? t("completedShort")
                                                                            : t("noTopics")}
                                                                </span>
                                                                <span className="tabular-nums text-[rgb(var(--ui-text-muted)/0.96)]">
                                                                    {Math.round(modulePct * 100)}%
                                                                </span>
                                                            </div>

                                                            <ProgressBar pct={modulePct} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="shrink-0 sm:pl-3">
                                                {seqLocked ? (
                                                    <DisabledAction fullWidth>{ctaLabel}</DisabledAction>
                                                ) : showPremium ? (
                                                    <NavButton
                                                        href={billingHref}
                                                        fullWidth
                                                        prefetch
                                                        className={getActionButtonClass("premium", true)}
                                                    >
                                                        {ctaLabel}
                                                    </NavButton>
                                                ) : (
                                                    <NavButton
                                                        href={moduleHref}
                                                        fullWidth
                                                        prefetch
                                                        className={getActionButtonClass("primary", true)}
                                                    >
                                                        {ctaLabel}
                                                    </NavButton>
                                                )}
                                            </div>
                                        </div>
                                    </Surface>
                                );
                            })}
                        </div>
                    ) : (
                        <Surface tone="page" className="p-4 sm:p-5">
                            <div className="ui-title-md text-base">{t("empty.title")}</div>
                            <div className="mt-1 text-sm text-[rgb(var(--ui-text-muted)/0.88)]">
                                {t("empty.desc")}
                            </div>
                        </Surface>
                    )}
                </div>
            </div>
        </div>
    );
}