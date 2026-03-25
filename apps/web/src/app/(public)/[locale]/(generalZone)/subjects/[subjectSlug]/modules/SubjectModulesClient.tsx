"use client";

import React, {useMemo} from "react";
import Link from "next/link";
import {useTranslations} from "next-intl";
import {ArrowRight, CheckCircle2, Lock, Sparkles} from "lucide-react";

import {cn} from "@/lib/cn";
import {useReviewProgressMany} from "@/components/review/module/hooks/useReviewProgressMany";
import {ROUTES} from "@/utils";
import {buildBillingHref} from "@/lib/billing/moduleAccess";

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

function Kicker({children}: { children: React.ReactNode }) {
    return (
        <div
            className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.18em] text-neutral-500 dark:text-white/45">
            {children}
        </div>
    );
}

function Surface({
                     children,
                     className,
                 }: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-[28px]",
                "bg-white/75 ring-1 ring-black/5 shadow-[0_18px_60px_-26px_rgba(0,0,0,0.24)] backdrop-blur-xl",
                "dark:bg-white/[0.06] dark:ring-white/10 dark:shadow-none",
                className
            )}
        >
            {children}
        </div>
    );
}

function Pill({
                  variant,
                  children,
              }: {
    variant: "good" | "neutral" | "warn";
    children: React.ReactNode;
}) {
    const cls =
        variant === "good"
            ? "bg-emerald-500/12 text-emerald-800 ring-1 ring-emerald-500/20 dark:bg-emerald-300/10 dark:text-emerald-200 dark:ring-emerald-200/15"
            : variant === "warn"
                ? "bg-amber-500/12 text-amber-800 ring-1 ring-amber-500/20 dark:bg-amber-300/10 dark:text-amber-200 dark:ring-amber-200/15"
                : "bg-neutral-500/10 text-neutral-700 ring-1 ring-neutral-500/15 dark:bg-white/8 dark:text-white/70 dark:ring-white/10";

    return (
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold", cls)}>
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
        <div
            className={cn(
                "rounded-2xl p-3 sm:p-4",
                "bg-white/70 ring-1 ring-black/5 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.18)]",
                "dark:bg-white/[0.05] dark:ring-white/10 dark:shadow-none"
            )}
        >
            <div
                className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                {label}
            </div>
            <div className="mt-1 text-lg sm:text-xl font-black tracking-tight tabular-nums">{value}</div>
            {subvalue ? (
                <div className="mt-1 text-xs font-semibold text-neutral-500 dark:text-white/50">
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
                <div className="flex items-center justify-between gap-3 text-[11px] font-extrabold tracking-wide text-neutral-600 dark:text-white/60">
                    <div className="min-w-0">{label}</div>
                    <span className="shrink-0 tabular-nums text-neutral-500 dark:text-white/45">{w}</span>
                </div>
            ) : null}

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
                <div
                    className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        showMin && "min-w-[10px]",
                        "bg-emerald-600 dark:hidden"
                    )}
                    style={{ width: w }}
                />
                <div
                    className={cn(
                        "hidden h-full rounded-full transition-[width] duration-300 dark:block",
                        showMin && "min-w-[10px]",
                        "dark:bg-gradient-to-r dark:from-emerald-300 dark:via-emerald-400 dark:to-teal-300"
                    )}
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
                "h-10 w-10 sm:h-11 sm:w-11 rounded-2xl grid place-items-center shrink-0",
                "ring-1 shadow-sm",
                completed
                    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-300/10 dark:text-emerald-200 dark:ring-emerald-200/15"
                    : locked
                        ? "bg-neutral-900/5 text-neutral-500 ring-black/5 dark:bg-white/5 dark:text-white/55 dark:ring-white/10"
                        : "bg-white/75 text-neutral-900 ring-black/5 dark:bg-white/5 dark:text-white/90 dark:ring-white/10"
            )}
            aria-hidden
        >
            {completed ? (
                <CheckCircle2 className="h-5 w-5"/>
            ) : locked ? (
                <Lock className="h-4 w-4"/>
            ) : (
                <span className="font-black tabular-nums">{idx + 1}</span>
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
            ? "ui-btn ui-btn-primary"
            : variant === "premium"
                ? "ui-btn ui-btn-premium"
                : "ui-btn ui-btn-secondary";

    return (
        <Link
            href={href}
            className={cn(
                cls,
                "rounded-2xl px-4 py-2.5 text-sm font-extrabold",
                fullWidth ? "w-full sm:w-auto" : ""
            )}
        >
            <span>{children}</span>
        </Link>
    );
}

function DisabledAction({children}: { children: React.ReactNode }) {
    return (
        <span
            className={cn(
                "ui-btn ui-btn-disabled rounded-2xl px-4 py-2.5 text-sm font-extrabold",
                "w-full sm:w-auto",
                "border border-black/5 bg-neutral-900/5 text-neutral-500",
                "dark:border-white/10 dark:bg-white/5 dark:text-white/45"
            )}
        >
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
    const {completed, seqLocked, showPremium, hasAnyProgress, t} = args;

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
    const {seqLocked, showPremium, accessReason} = args;

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

    const {loading: progressLoading, byModuleId: progByModuleSlug} = useReviewProgressMany({
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
        <div
            className={cn(
                "min-h-screen text-neutral-900 dark:text-white/90",
                "bg-[radial-gradient(1200px_700px_at_20%_0%,#eafff5_0%,#ffffff_52%,#f6f7ff_100%)]",
                "dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_52%)]"
            )}
        >
            <div
                className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 h-56",
                    "bg-[linear-gradient(90deg,rgba(16,185,129,0.10),rgba(59,130,246,0.06),rgba(236,72,153,0.05))]",
                    "dark:bg-[linear-gradient(90deg,rgba(110,231,183,0.08),rgba(147,197,253,0.05),rgba(251,113,133,0.04))]",
                    "opacity-70 blur-3xl"
                )}
                aria-hidden
            />

            <div className="ui-container relative grid gap-4 py-5 sm:gap-5 md:gap-6 md:py-8">
                <Surface className="relative overflow-hidden p-4 sm:p-5 md:p-6">
                    <div
                        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_45%)] dark:bg-[radial-gradient(circle_at_80%_20%,rgba(110,231,183,0.08),transparent_45%)]"
                        aria-hidden
                    />

                    <div
                        className="relative grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)] lg:items-start">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Kicker>{t("kickerSubject")}</Kicker>
                                {unlockAll ? <Pill variant="warn">{t("unlockEnabled")}</Pill> : null}
                                {progressLoading ? <Pill variant="neutral">{t("syncing")}</Pill> : null}
                            </div>

                            <div className="mt-2 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                                {subjectTitle}
                            </div>

                            {subjectDescription ? (
                                <div
                                    className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70 sm:text-base">
                                    {subjectDescription}
                                </div>
                            ) : null}

                            <div className="mt-5">
                                <ProgressBar
                                    pct={subjectStats.pct}
                                    label={
                                        <div
                                            className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
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

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                            <StatCard
                                label={t("topicsLabel")}
                                value={`${subjectStats.doneTopics}/${subjectStats.totalTopics}`}
                            />
                            <StatCard label={t("sectionsLabel")} value={subjectStats.totalSections}/>
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
                    <div className="grid gap-4">
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
                                encodeURIComponent(m.slug)
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
                                        "group relative overflow-hidden transition-all duration-200",
                                        !seqLocked && "hover:-translate-y-[2px] hover:ring-emerald-400/20",
                                        completed && "ring-emerald-500/15 dark:ring-emerald-300/12"
                                    )}
                                >
                                    <div
                                        className={cn(
                                            "pointer-events-none absolute inset-y-0 left-0 w-1.5 rounded-full",
                                            completed
                                                ? "bg-gradient-to-b from-emerald-400/90 via-emerald-500/70 to-teal-400/70"
                                                : seqLocked
                                                    ? "bg-neutral-300/70 dark:bg-white/10"
                                                    : showPremium
                                                        ? "bg-gradient-to-b from-amber-300/90 via-amber-400/70 to-yellow-300/70"
                                                        : "bg-gradient-to-b from-emerald-300/70 via-sky-300/50 to-transparent"
                                        )}
                                        aria-hidden
                                    />

                                    <div
                                        className={cn(
                                            "pointer-events-none absolute -inset-24 opacity-0 transition-opacity group-hover:opacity-100",
                                            "bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.14),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(59,130,246,0.10),transparent_55%)]",
                                            "dark:bg-[radial-gradient(circle_at_20%_20%,rgba(110,231,183,0.10),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(147,197,253,0.07),transparent_55%)]"
                                        )}
                                        aria-hidden
                                    />

                                    <div className="relative p-4 sm:p-5 md:p-6">
                                        <div
                                            className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 gap-3 sm:gap-4">
                                                    <IconCircle idx={idx} completed={completed} locked={seqLocked}/>

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

                                                            {progressLoading ?
                                                                <Pill variant="neutral">{t("syncing")}</Pill> : null}
                                                        </div>

                                                        <div
                                                            className="mt-2 text-lg font-black tracking-tight sm:text-xl md:text-2xl">
                                                            {m.title}
                                                        </div>

                                                        {m.description ? (
                                                            <div
                                                                className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70">
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

                                            <StatCard label={t("sectionsLabel")} value={modSections.length}/>

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
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300"/>
                            ) : showPremium ? (
                                <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-300"/>
                            ) : seqLocked ? (
                                <Lock className="h-4 w-4 text-neutral-500 dark:text-white/50"/>
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
                                ? t("topicsComplete", {done: doneTopics, total: totalTopics})
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
                        <div className="text-lg font-black tracking-tight">{t("empty.title")}</div>
                        <div className="mt-2 text-sm text-neutral-600 dark:text-white/70">
                            {t("empty.desc")}
                        </div>
                    </Surface>
                )}
            </div>
        </div>
    );
}