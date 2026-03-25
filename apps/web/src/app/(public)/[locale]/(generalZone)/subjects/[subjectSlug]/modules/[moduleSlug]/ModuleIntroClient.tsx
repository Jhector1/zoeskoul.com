"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { useReviewProgressMany } from "@/components/review/module/hooks/useReviewProgressMany";
import { ROUTES } from "@/utils";
import type { ModuleMeta } from "@/seed/data/subjects/_types";

type Props = {
    locale: string;
    subject: {
        slug: string;
        title: string;
        description: string | null;
        imagePublicId: string | null;
        imageAlt: string | null;
    };
    module: {
        id: string;
        slug: string;
        title: string;
        description: string | null;
        order: number;
        weekStart: number | null;
        weekEnd: number | null;
        meta: ModuleMeta | null;
    };
    stats: { sectionsCount: number; topicsCount: number };
};

function Kicker({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.2em] text-neutral-500 dark:text-white/45">
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
                "rounded-[28px] border p-4 sm:p-5 lg:p-6",
                "bg-white/78 border-black/5 shadow-[0_20px_60px_-28px_rgba(0,0,0,0.28)] backdrop-blur-xl",
                "dark:bg-white/[0.06] dark:border-white/10 dark:shadow-none",
                className,
            )}
        >
            {children}
        </div>
    );
}

function StatTile({
                      label,
                      value,
                      subtle,
                  }: {
    label: string;
    value: React.ReactNode;
    subtle?: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "rounded-2xl px-3 py-3 sm:px-4",
                "bg-white/75 ring-1 ring-black/5",
                "dark:bg-white/[0.05] dark:ring-white/10",
            )}
        >
            <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                {label}
            </div>
            <div className="mt-1 text-base sm:text-lg font-black tracking-tight tabular-nums">
                {value}
            </div>
            {subtle ? (
                <div className="mt-1 text-xs text-neutral-500 dark:text-white/55">{subtle}</div>
            ) : null}
        </div>
    );
}

function SectionCard({
                         title,
                         eyebrow,
                         children,
                     }: {
    title: string;
    eyebrow?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <Surface className="h-full">
            {eyebrow ? <Kicker>{eyebrow}</Kicker> : null}
            <div className="mt-1 text-lg sm:text-xl font-black tracking-tight">{title}</div>
            <div className="mt-4">{children}</div>
        </Surface>
    );
}

function BulletList({
                        items,
                        marker = "✓",
                    }: {
    items: string[];
    marker?: "✓" | "•" | "→";
}) {
    return (
        <ul className="grid gap-2.5 text-sm sm:text-[15px] text-neutral-700 dark:text-white/75">
            {items.map((x) => (
                <li key={x} className="flex items-start gap-3">
                    <span className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-black text-white dark:bg-white/12 dark:text-white/90">
                        {marker}
                    </span>
                    <span className="leading-6">{x}</span>
                </li>
            ))}
        </ul>
    );
}

function VideoEmbed({ url, title }: { url: string; title: string }) {
    const t = useTranslations("moduleIntroUi");

    const isYouTube = /youtube\.com\/watch\?v=|youtu\.be\//.test(url) || /youtube\.com\/embed\//.test(url);
    const isVimeo = /vimeo\.com\/\d+/.test(url) || /player\.vimeo\.com\/video\//.test(url);
    const isMp4 = /\.mp4(\?|#|$)/i.test(url);

    const embedUrl = (() => {
        if (isYouTube) {
            if (url.includes("youtube.com/embed/")) return url;
            const m = url.match(/v=([^&]+)/);
            const vid = m?.[1] ?? url.split("youtu.be/")[1]?.split(/[?&]/)[0];
            return vid ? `https://www.youtube.com/embed/${vid}` : url;
        }
        if (isVimeo) {
            if (url.includes("player.vimeo.com/video/")) return url;
            const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
            return id ? `https://player.vimeo.com/video/${id}` : url;
        }
        return url;
    })();

    return (
        <Surface className="overflow-hidden p-0">
            <div className="p-4 sm:p-5 lg:p-6 pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <Kicker>{t("introVideoKicker")}</Kicker>
                        <div className="mt-1 text-base sm:text-lg font-black tracking-tight truncate">{title}</div>
                        <div className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-white/60">
                            {t("introVideoHint")}
                        </div>
                    </div>

                    <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                            "inline-flex shrink-0 items-center justify-center rounded-2xl px-3.5 py-2 text-xs sm:text-sm font-extrabold",
                            "bg-neutral-900 text-white shadow-sm transition hover:shadow-md active:scale-[0.99]",
                            "dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/12",
                        )}
                    >
                        {t("openLink")}
                    </a>
                </div>
            </div>

            <div className="px-4 sm:px-5 lg:px-6 pb-4 sm:pb-5 lg:pb-6">
                <div className="relative overflow-hidden rounded-2xl ring-1 ring-black/5 dark:ring-white/10">
                    <div className="aspect-video">
                        {isMp4 ? (
                            <video className="h-full w-full" controls preload="metadata">
                                <source src={embedUrl} />
                            </video>
                        ) : (
                            <iframe
                                className="h-full w-full"
                                src={embedUrl}
                                title={title}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        )}
                    </div>
                </div>
            </div>
        </Surface>
    );
}

export default function ModuleIntroClient({ locale, subject, module, stats }: Props) {
    const t = useTranslations("moduleIntroUi");

    const progressModuleKey = module.slug;

    const { byModuleId, loading } = useReviewProgressMany({
        subjectSlug: subject.slug,
        locale,
        moduleIds: [progressModuleKey],
        enabled: true,
        refreshMs: 0,
    });

    const mp = byModuleId[progressModuleKey];
    const completedCount = mp?.completedTopicKeys?.size ?? 0;
    const completed = Boolean(mp?.moduleCompleted);
    const hasAnyProgress = completedCount > 0;

    const ctaLabel = completed ? t("cta.review") : hasAnyProgress ? t("cta.continue") : t("cta.start");

    const learnHref = `/${encodeURIComponent(locale)}/${ROUTES.learningPath(
        encodeURIComponent(subject.slug),
        encodeURIComponent(module.slug),
    )}`;

    const backHref = `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(subject.slug)}/modules`;

    const meta = useMemo<ModuleMeta>(() => module.meta ?? ({} satisfies ModuleMeta), [module.meta]);

    const outcomes = useMemo(() => {
        const xs = meta.outcomes?.filter(Boolean) ?? [];
        return xs.length ? xs : [t("defaults.outcome1"), t("defaults.outcome2"), t("defaults.outcome3")];
    }, [meta.outcomes, t]);

    const why = useMemo(() => {
        const xs = meta.why?.filter(Boolean) ?? [];
        return xs.length ? xs : [t("defaults.why1"), t("defaults.why2"), t("defaults.why3")];
    }, [meta.why, t]);

    const prereqs = useMemo(() => meta.prereqs?.filter(Boolean) ?? [], [meta.prereqs]);

    const est = meta.estimatedMinutes ?? null;
    const videoUrl = meta.videoUrl ?? null;

    const statusText = loading
        ? t("status.syncing")
        : completed
            ? t("status.completed")
            : hasAnyProgress
                ? t("status.inProgress")
                : t("status.new");

    const progressPct =
        stats.topicsCount > 0 ? Math.max(0, Math.min(100, Math.round((completedCount / stats.topicsCount) * 100))) : 0;

    const kicker = t("kicker", { subject: subject.title, n: module.order + 1 });
    const videoTitle = t("videoTitle", { module: module.title });

    return (
        <div
            className={cn(
                "relative min-h-screen overflow-hidden text-neutral-900 dark:text-white/90",
                "bg-[radial-gradient(1000px_500px_at_0%_0%,rgba(16,185,129,0.14),transparent_60%),radial-gradient(1000px_500px_at_100%_0%,rgba(59,130,246,0.10),transparent_58%),linear-gradient(180deg,#f8fffb_0%,#ffffff_40%,#f7f8ff_100%)]",
                "dark:bg-[radial-gradient(1000px_500px_at_0%_0%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(1000px_500px_at_100%_0%,rgba(59,130,246,0.10),transparent_55%),linear-gradient(180deg,#0c1018_0%,#0b0d12_45%,#0b0d12_100%)]",
            )}
        >
            <div
                className={cn(
                    "pointer-events-none absolute -top-20 left-[-10%] h-64 w-64 rounded-full blur-3xl",
                    "bg-emerald-300/25 dark:bg-emerald-300/10",
                )}
                aria-hidden
            />
            <div
                className={cn(
                    "pointer-events-none absolute right-[-8%] top-10 h-72 w-72 rounded-full blur-3xl",
                    "bg-sky-300/20 dark:bg-sky-300/10",
                )}
                aria-hidden
            />

            <div className="ui-container relative py-5 sm:py-7 lg:py-10">
                <div className="grid gap-4 lg:gap-6">
                    {/* HERO */}
                    <Surface className="overflow-hidden">
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)] lg:gap-6">
                            {/* LEFT */}
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Kicker>{kicker}</Kicker>

                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span
                                                className={cn(
                                                    "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em]",
                                                    "bg-neutral-900 text-white dark:bg-white/10 dark:text-white/85",
                                                )}
                                            >
                                                {subject.title}
                                            </span>

                                            <span
                                                className={cn(
                                                    "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em]",
                                                    "bg-white/75 ring-1 ring-black/5 dark:bg-white/[0.05] dark:ring-white/10",
                                                )}
                                            >
                                                {statusText}
                                            </span>
                                        </div>

                                        <h1 className="mt-3 max-w-4xl text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
                                            {module.title}
                                        </h1>

                                        {(module.description || subject.description) ? (
                                            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 sm:text-[15px] dark:text-white/70">
                                                {module.description ?? subject.description}
                                            </p>
                                        ) : null}
                                    </div>

                                    <Link
                                        href={backHref}
                                        className={cn(
                                            "ui-btn ui-btn-pill-strong ui-btn-secondary"
                                        )}
                                    >
                                        {t("actions.back")}
                                    </Link>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <StatTile
                                        label={t("labels.sections")}
                                        value={stats.sectionsCount}
                                    />
                                    <StatTile
                                        label={t("labels.topics")}
                                        value={stats.topicsCount}
                                    />
                                    <StatTile
                                        label={t("labels.weeks")}
                                        value={
                                            module.weekStart != null || module.weekEnd != null
                                                ? `${module.weekStart ?? "?"}–${module.weekEnd ?? "?"}`
                                                : "—"
                                        }
                                    />
                                    <StatTile
                                        label={t("labels.est")}
                                        value={est != null ? t("minutesShort", { n: est }) : "—"}
                                    />
                                </div>

                                <div
                                    className={cn(
                                        "mt-5 rounded-2xl p-4",
                                        "bg-white/75 ring-1 ring-black/5",
                                        "dark:bg-white/[0.05] dark:ring-white/10",
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black">Progress</div>
                                            <div className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-white/60">
                                                {completedCount} / {stats.topicsCount} topics completed
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className="text-xl sm:text-2xl font-black tabular-nums">{progressPct}%</div>
                                        </div>
                                    </div>

                                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-200/80 dark:bg-white/10">
                                        <div
                                            className="h-full rounded-full bg-[linear-gradient(90deg,#10b981_0%,#3b82f6_100%)] transition-[width] duration-500"
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                                    <Link
                                        href={learnHref}
                                        className={cn(
                                            "ui-btn ui-btn-primary",
                                        )}
                                    >
                                        {ctaLabel}
                                    </Link>
                                </div>
                            </div>

                            {/* RIGHT */}
                            <div className="min-w-0">
                                <div
                                    className={cn(
                                        "h-full rounded-[24px] p-4 sm:p-5",
                                        "bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.86))]",
                                        "ring-1 ring-black/5",
                                        "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.04))] dark:ring-white/10",
                                    )}
                                >
                                    <Kicker>{t("sections.prereqs")}</Kicker>
                                    <div className="mt-2 text-lg font-black tracking-tight">
                                        {prereqs.length ? "Before you start" : "Ready to begin"}
                                    </div>

                                    <div className="mt-4">
                                        {prereqs.length ? (
                                            <BulletList items={prereqs} marker="→" />
                                        ) : (
                                            <div className="rounded-2xl bg-white/70 px-4 py-4 text-sm leading-6 text-neutral-700 ring-1 ring-black/5 dark:bg-white/[0.05] dark:text-white/72 dark:ring-white/10">
                                                This module is ready to start with no required prerequisites listed.
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-5 grid gap-3">
                                        <div
                                            className={cn(
                                                "rounded-2xl px-4 py-3",
                                                "bg-white/80 ring-1 ring-black/5",
                                                "dark:bg-white/[0.05] dark:ring-white/10",
                                            )}
                                        >
                                            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                                                {t("labels.status")}
                                            </div>
                                            <div className="mt-1 text-base font-black">{statusText}</div>
                                        </div>

                                        <div
                                            className={cn(
                                                "rounded-2xl px-4 py-3",
                                                "bg-white/80 ring-1 ring-black/5",
                                                "dark:bg-white/[0.05] dark:ring-white/10",
                                            )}
                                        >
                                            <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                                                Module order
                                            </div>
                                            <div className="mt-1 text-base font-black">#{module.order + 1}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Surface>

                    {/* VIDEO */}
                    {videoUrl ? <VideoEmbed url={videoUrl} title={videoTitle} /> : null}

                    {/* CONTENT */}
                    <div className="grid gap-4 lg:grid-cols-2">
                        <SectionCard title={t("sections.whatLearn")} eyebrow={t("sections.whatLearn")}>
                            <BulletList items={outcomes} marker="✓" />
                        </SectionCard>

                        <SectionCard title={t("sections.whyMatters")} eyebrow={t("sections.whyMatters")}>
                            <BulletList items={why} marker="•" />
                        </SectionCard>
                    </div>
                </div>
            </div>
        </div>
    );
}