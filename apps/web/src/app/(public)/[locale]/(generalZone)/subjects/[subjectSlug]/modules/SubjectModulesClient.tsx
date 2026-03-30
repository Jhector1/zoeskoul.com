"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Lock, Sparkles } from "lucide-react";

import { cn } from "@/lib/cn";
import { useReviewProgressMany } from "@/components/review/module/hooks/useReviewProgressMany";
import { ROUTES } from "@/utils";
import { buildBillingHref } from "@/lib/billing/moduleAccess";

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
    if (!topicKeys.length) return 0;
    if (!completed || completed.size === 0) return 0;

    let n = 0;
    for (const k of topicKeys) {
        if (completed.has(k)) n++;
    }
    return n;
}

function Kicker({ children }: { children: React.ReactNode }) {
    return <div className="ui-kicker">{children}</div>;
}

function Surface({
                     children,
                     className,
                 }: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn("ui-page-surface", className)}>{children}</div>;
}

function Pill({
                  variant,
                  children,
              }: {
    variant: "good" | "neutral" | "warn";
    children: React.ReactNode;
}) {
    return (
        <span
            className={cn(
                variant === "good" && "ui-pill-good",
                variant === "neutral" && "ui-pill-neutral",
                variant === "warn" && "ui-pill-warn",
            )}
        >
      {children}
    </span>
    );
}

function StatCard({
                      label,
                      value,
                      subvalue,
                  }: {
    label: React.ReactNode;
    value: React.ReactNode;
    subvalue?: React.ReactNode;
}) {
    return (
        <div className="ui-stat-card ui-surface">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500 dark:text-white/40">
                {label}
            </div>
            <div className="mt-1 text-base font-semibold tracking-tight tabular-nums text-neutral-900 dark:text-white/90">
                {value}
            </div>
            {subvalue ? (
                <div className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-white/50">
                    {subvalue}
                </div>
            ) : null}
        </div>
    );
}

function ProgressBar({ pct, label }: { pct: number; label?: React.ReactNode }) {
    const safePct = clamp01(pct);
    const w = `${Math.round(safePct * 100)}%`;
    const showMin = safePct > 0;

    return (
        <div className="grid gap-1.5">
            {label ? (
                <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-neutral-500 dark:text-white/50">
                    <div className="min-w-0">{label}</div>
                    <span className="shrink-0 tabular-nums">{w}</span>
                </div>
            ) : null}

            <div className="ui-progress-track">
                <div
                    className={cn("ui-progress-fill", showMin && "min-w-[10px]")}
                    style={{ width: w }}
                />
            </div>
        </div>
    );
}

function IconCircle({
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
                "ui-icon-box",
                completed && "border-emerald-300/20 bg-emerald-300/10 text-emerald-700 dark:text-emerald-200",
                locked && "bg-neutral-50 text-neutral-500 dark:bg-white/[0.04] dark:text-white/50",
            )}
            aria-hidden
        >
            {completed ? (
                <CheckCircle2 className="h-4 w-4" />
            ) : locked ? (
                <Lock className="h-4 w-4" />
            ) : (
                <span className="font-medium tabular-nums">{idx + 1}</span>
            )}
        </div>
    );
}

function ActionLink({
                        href,
                        children,
                        fullWidth = false,
                        variant = "primary",
                    }: {
    href: string;
    children: React.ReactNode;
    fullWidth?: boolean;
    variant?: "primary" | "secondary" | "premium";
}) {
    const cls =
        variant === "primary"
            ? "ui-btn-primary"
            : variant === "premium"
                ? "ui-btn-premium"
                : "ui-btn-secondary";

    return (
        <Link href={href} className={cn(cls, fullWidth ? "w-full sm:w-auto" : "")}>
            <span>{children}</span>
        </Link>
    );
}

function DisabledAction({ children }: { children: React.ReactNode }) {
    return (
        <span className="ui-btn-disabled w-full sm:w-auto">
      <span>{children}</span>
    </span>
    );
}

function getStatusText(args: {
    completed: boolean;
    seqLocked: boolean;
    showPremium: boolean;
    hasAnyProgress: boolean;
    t: ReturnType<typeof useTranslations>;
}) {
    const { completed, seqLocked, showPremium, hasAnyProgress, t } = args;

    if (completed) return t("pillCompleted");
    if (seqLocked) return t("pillLocked");
    if (showPremium) return t("pillPremium");
    if (hasAnyProgress) return t("pillInProgress");
    return t("pillNotStarted");
}

function getAccessText(args: {
    seqLocked: boolean;
    showPremium: boolean;
    accessReason: string;
}) {
    const { seqLocked, showPremium, accessReason } = args;

    if (seqLocked) return "Sequential";
    if (showPremium && accessReason === "requires_login") return "Sign in required";
    if (showPremium) return "Premium";
    return "Included";
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

            const fallback =
                direct === 0 &&
                moduleTopicKeys.length > 0 &&
                (mp?.completedTopicKeys?.size ?? 0) > 0
                    ? Math.min(moduleTopicKeys.length, mp!.completedTopicKeys.size)
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
            totalSections: sections.length,
        };
    }, [sortedModules, progByModuleSlug, topicIdsByModuleDbId, sections.length]);

    const backHref = `/${encodeURIComponent(locale)}/subjects`;

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white/90">
            <div className="ui-container grid gap-4 py-5 sm:gap-5 md:gap-6 md:py-8">
                <Surface className="p-4 sm:p-5 md:p-6">
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)] lg:items-start">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Kicker>{t("kickerSubject")}</Kicker>
                                {unlockAll ? <Pill variant="warn">{t("unlockEnabled")}</Pill> : null}
                                {progressLoading ? <Pill variant="neutral">{t("syncing")}</Pill> : null}
                            </div>

                            <div className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                                {subjectTitle}
                            </div>

                            {subjectDescription ? (
                                <div className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70 sm:text-base">
                                    {subjectDescription}
                                </div>
                            ) : null}

                            <div className="mt-5">
                                <ProgressBar
                                    pct={subjectStats.pct}
                                    label={
                                        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                                            <span>{t("overallProgress")}</span>
                                            <span className="tabular-nums">
                        {progressLoading
                            ? t("syncing")
                            : t("topicsRatio", {
                                done: subjectStats.doneTopics,
                                total: subjectStats.totalTopics,
                            })}
                      </span>
                                            {subjectStats.totalModules ? (
                                                <span className="tabular-nums text-neutral-500 dark:text-white/45">
                          {t("modulesRatio", {
                              done: subjectStats.completedModules,
                              total: subjectStats.totalModules,
                          })}
                        </span>
                                            ) : null}
                                        </div>
                                    }
                                />
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                            <StatCard
                                label={t("topicsLabel")}
                                value={`${subjectStats.doneTopics}/${subjectStats.totalTopics}`}
                            />
                            <StatCard label={t("sectionsLabel")} value={subjectStats.totalSections} />
                            <StatCard
                                label={t("kickerModule")}
                                value={subjectStats.totalModules}
                                subvalue={t("modulesRatio", {
                                    done: subjectStats.completedModules,
                                    total: subjectStats.totalModules,
                                })}
                            />
                            <div className="flex items-end">
                                <ActionLink href={backHref} fullWidth variant="secondary">
                                    {t("changeSubject")}
                                </ActionLink>
                            </div>
                        </div>
                    </div>
                </Surface>

                {sortedModules.length ? (
                    <div className="grid gap-3">
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

                            const doneTopics =
                                directDone === 0 && totalTopics > 0 && (mp?.completedTopicKeys?.size ?? 0) > 0
                                    ? Math.min(totalTopics, mp!.completedTopicKeys.size)
                                    : directDone;

                            const modulePct =
                                totalTopics > 0 ? clamp01(doneTopics / totalTopics) : completed ? 1 : 0;

                            const hasAnyProgress = (mp?.completedTopicKeys?.size ?? 0) > 0 || doneTopics > 0;

                            const moduleHref = `/${encodeURIComponent(locale)}/${ROUTES.moduleIntro(
                                encodeURIComponent(subjectSlug),
                                encodeURIComponent(m.slug),
                            )}`;

                            const modulesListPath = `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(subjectSlug)}/modules`;

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

                            const statusText = getStatusText({
                                completed,
                                seqLocked,
                                showPremium,
                                hasAnyProgress,
                                t,
                            });

                            const accessText = getAccessText({
                                seqLocked,
                                showPremium,
                                accessReason: access.reason,
                            });

                            return (
                                <Surface
                                    key={m.slug}
                                    className={cn(
                                        "transition-colors",
                                        !seqLocked && "hover:border-neutral-300 dark:hover:border-white/15",
                                        completed && "border-emerald-300/20 dark:border-emerald-300/15",
                                    )}
                                >
                                    <div className="p-4 sm:p-5">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 gap-3">
                                                    <IconCircle idx={idx} completed={completed} locked={seqLocked} />

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Kicker>{t("kickerModule")}</Kicker>

                                                            {completed ? (
                                                                <Pill variant="good">{t("pillCompleted")}</Pill>
                                                            ) : seqLocked ? (
                                                                <Pill variant="neutral">{t("pillLocked")}</Pill>
                                                            ) : showPremium ? (
                                                                <Pill variant="warn">{t("pillPremium")}</Pill>
                                                            ) : hasAnyProgress ? (
                                                                <Pill variant="warn">{t("pillInProgress")}</Pill>
                                                            ) : (
                                                                <Pill variant="neutral">{t("pillNotStarted")}</Pill>
                                                            )}

                                                            {progressLoading ? <Pill variant="neutral">{t("syncing")}</Pill> : null}
                                                        </div>

                                                        <div className="mt-2 text-lg font-semibold tracking-tight sm:text-xl">
                                                            {m.title}
                                                        </div>

                                                        {m.description ? (
                                                            <div className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70">
                                                                {m.description}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="w-full lg:w-auto lg:shrink-0">
                                                {seqLocked ? (
                                                    <DisabledAction>{ctaLabel}</DisabledAction>
                                                ) : showPremium ? (
                                                    <ActionLink href={billingHref} fullWidth variant="premium">
                                                        {ctaLabel}
                                                    </ActionLink>
                                                ) : (
                                                    <ActionLink href={moduleHref} fullWidth variant="primary">
                                                        {ctaLabel}
                                                    </ActionLink>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                            {(m.weekStart != null || m.weekEnd != null) && (
                                                <StatCard
                                                    label={t("weeksLabel")}
                                                    value={
                                                        <span className="tabular-nums">
                              {m.weekStart ?? "?"}–{m.weekEnd ?? "?"}
                            </span>
                                                    }
                                                />
                                            )}

                                            <StatCard label={t("sectionsLabel")} value={modSections.length} />

                                            <StatCard
                                                label={t("topicsLabel")}
                                                value={
                                                    totalTopics ? (
                                                        <span className="tabular-nums">
                              {doneTopics}/{totalTopics}
                            </span>
                                                    ) : (
                                                        t("noTopics")
                                                    )
                                                }
                                            />

                                            <StatCard
                                                label="Status"
                                                value={
                                                    <span className="inline-flex items-center gap-1.5">
                            {completed ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                            ) : showPremium ? (
                                <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                            ) : seqLocked ? (
                                <Lock className="h-4 w-4 text-neutral-500 dark:text-white/50" />
                            ) : null}
                                                        <span>{statusText}</span>
                          </span>
                                                }
                                                subvalue={accessText}
                                            />
                                        </div>

                                        <div className="mt-4">
                                            <ProgressBar
                                                pct={modulePct}
                                                label={
                                                    <span>
                            {totalTopics
                                ? t("topicsComplete", { done: doneTopics, total: totalTopics })
                                : completed
                                    ? t("completedShort")
                                    : t("noTopics")}
                          </span>
                                                }
                                            />
                                        </div>
                                    </div>
                                </Surface>
                            );
                        })}
                    </div>
                ) : (
                    <Surface className="p-4 sm:p-5 md:p-6">
                        <div className="text-lg font-semibold tracking-tight">{t("empty.title")}</div>
                        <div className="mt-2 text-sm text-neutral-600 dark:text-white/70">
                            {t("empty.desc")}
                        </div>
                    </Surface>
                )}
            </div>
        </div>
    );
}