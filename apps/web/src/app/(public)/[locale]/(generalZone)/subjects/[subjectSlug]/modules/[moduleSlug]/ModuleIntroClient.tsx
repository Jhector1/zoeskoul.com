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
    return <div className="ui-kicker">{children}</div>;
}

function Surface({
                     children,
                     className,
                 }: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn("ui-page-surface p-4 sm:p-5", className)}>{children}</div>;
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
        <div className="ui-stat-card">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500 dark:text-white/40">
                {label}
            </div>
            <div className="mt-1 text-base font-semibold tracking-tight tabular-nums text-neutral-900 dark:text-white/90">
                {value}
            </div>
            {subtle ? (
                <div className="mt-1 text-[11px] text-neutral-500 dark:text-white/50">{subtle}</div>
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
            <div className="mt-1 text-lg font-semibold tracking-tight text-neutral-900 dark:text-white/90">
                {title}
            </div>
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
        <ul className="grid gap-2 text-sm text-neutral-700 dark:text-white/75">
            {items.map((x) => (
                <li key={x} className="flex items-start gap-3">
          <span className="mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-medium text-white dark:bg-white/12 dark:text-white/90">
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

    const isYouTube =
        /youtube\.com\/watch\?v=|youtu\.be\//.test(url) ||
        /youtube\.com\/embed\//.test(url);
    const isVimeo =
        /vimeo\.com\/\d+/.test(url) ||
        /player\.vimeo\.com\/video\//.test(url);
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
            <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-4 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <Kicker>{t("introVideoKicker")}</Kicker>
                    <div className="mt-1 truncate text-base font-semibold tracking-tight text-neutral-900 dark:text-white/90">
                        {title}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500 dark:text-white/50">
                        {t("introVideoHint")}
                    </div>
                </div>

                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="ui-btn-secondary"
                >
                    {t("openLink")}
                </a>
            </div>

            <div className="p-4">
                <div className="relative overflow-hidden rounded-lg border border-neutral-200 dark:border-white/10">
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
        stats.topicsCount > 0
            ? Math.max(0, Math.min(100, Math.round((completedCount / stats.topicsCount) * 100)))
            : 0;

    const kicker = t("kicker", { subject: subject.title, n: module.order + 1 });
    const videoTitle = t("videoTitle", { module: module.title });

    return (
        <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white/90">
            <div className="ui-container py-5 sm:py-7 lg:py-10">
                <div className="grid gap-4 lg:gap-5">
                    <Surface>
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Kicker>{kicker}</Kicker>

                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span className="ui-pill-neutral">{subject.title}</span>
                                            <span className="ui-pill-neutral">{statusText}</span>
                                        </div>

                                        <h1 className="mt-3 max-w-4xl text-2xl font-semibold tracking-tight sm:text-3xl lg:text-[2rem]">
                                            {module.title}
                                        </h1>

                                        {(module.description || subject.description) ? (
                                            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70">
                                                {module.description ?? subject.description}
                                            </p>
                                        ) : null}
                                    </div>

                                    <Link href={backHref} className="ui-btn-secondary">
                                        {t("actions.back")}
                                    </Link>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <StatTile label={t("labels.sections")} value={stats.sectionsCount} />
                                    <StatTile label={t("labels.topics")} value={stats.topicsCount} />
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

                                <div className="mt-5 rounded-lg border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium">Progress</div>
                                            <div className="mt-1 text-[11px] text-neutral-500 dark:text-white/50">
                                                {completedCount} / {stats.topicsCount} topics completed
                                            </div>
                                        </div>

                                        <div className="text-right text-xl font-semibold tabular-nums sm:text-2xl">
                                            {progressPct}%
                                        </div>
                                    </div>

                                    <div className="ui-progress-track mt-3">
                                        <div className="ui-progress-fill" style={{ width: `${progressPct}%` }} />
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                                    <Link href={learnHref} className="ui-btn-primary">
                                        {ctaLabel}
                                    </Link>
                                </div>
                            </div>

                            <div className="min-w-0">
                                <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                                    <Kicker>{t("sections.prereqs")}</Kicker>
                                    <div className="mt-2 text-lg font-semibold tracking-tight">
                                        {prereqs.length ? "Before you start" : "Ready to begin"}
                                    </div>

                                    <div className="mt-4">
                                        {prereqs.length ? (
                                            <BulletList items={prereqs} marker="→" />
                                        ) : (
                                            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/72">
                                                This module is ready to start with no required prerequisites listed.
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-5 grid gap-2">
                                        <div className="ui-stat-card">
                                            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500 dark:text-white/40">
                                                {t("labels.status")}
                                            </div>
                                            <div className="mt-1 text-base font-semibold">{statusText}</div>
                                        </div>

                                        <div className="ui-stat-card">
                                            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500 dark:text-white/40">
                                                Module order
                                            </div>
                                            <div className="mt-1 text-base font-semibold">#{module.order + 1}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Surface>

                    {videoUrl ? <VideoEmbed url={videoUrl} title={videoTitle} /> : null}

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