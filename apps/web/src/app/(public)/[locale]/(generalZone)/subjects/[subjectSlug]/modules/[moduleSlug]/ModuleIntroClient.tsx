"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, CheckCircle2, PlayCircle, Sparkles } from "lucide-react";

import { cn } from "@/lib/cn";
import { useReviewProgressMany } from "@/components/review/module/hooks/useReviewProgressMany";
import { ROUTES } from "@/utils";
import type { ModuleMeta } from "@/seed/data/subjects/_types";
import NavButton from "@/components/ui/NavButton";

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

function Surface({
                     children,
                     className,
                     tone = "page",
                 }: {
    children: React.ReactNode;
    className?: string;
    tone?: "page" | "default" | "muted";
}) {
    return (
        <div
            className={cn(
                tone === "muted"
                    ? "ui-surface-muted"
                    : tone === "default"
                        ? "ui-surface"
                        : "ui-page-surface",
                className,
            )}
        >
            {children}
        </div>
    );
}

function Kicker({ children }: { children: React.ReactNode }) {
    return <div className="ui-kicker">{children}</div>;
}

function StatusPill({
                        tone,
                        children,
                    }: {
    tone: "neutral" | "good" | "warn" | "info";
    children: React.ReactNode;
}) {
    const cls =
        tone === "good"
            ? "ui-pill-good"
            : tone === "warn"
                ? "ui-pill-warn"
                : tone === "info"
                    ? "ui-pill-info"
                    : "ui-pill-neutral";

    return <span className={cls}>{children}</span>;
}

function CompactMeta({
                         label,
                         value,
                     }: {
    label: React.ReactNode;
    value: React.ReactNode;
}) {
    return (
        <div className="grid gap-0.5">
            <div className="ui-meta">{label}</div>
            <div className="text-sm font-medium tabular-nums text-[rgb(var(--ui-text)/0.96)]">
                {value}
            </div>
        </div>
    );
}

function ProgressBar({ pct }: { pct: number }) {
    return (
        <div className="ui-progress-track h-1.5">
            <div className="ui-progress-fill" style={{ width: `${pct}%` }} />
        </div>
    );
}

function BulletList({
                        items,
                        marker = "check",
                    }: {
    items: string[];
    marker?: "check" | "dot" | "arrow";
}) {
    return (
        <ul className="grid gap-2.5">
            {items.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                    <span
                        className={cn(
                            "mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-medium",
                            marker === "check" &&
                            "bg-[rgb(var(--ui-accent)/0.10)] text-[rgb(var(--ui-accent)/1)]",
                            marker === "dot" &&
                            "bg-[rgb(var(--ui-surface-3)/1)] text-[rgb(var(--ui-text-muted)/0.9)]",
                            marker === "arrow" &&
                            "bg-[rgb(var(--ui-info)/0.10)] text-[rgb(var(--ui-info)/1)]",
                        )}
                        aria-hidden
                    >
                        {marker === "check" ? "✓" : marker === "arrow" ? "→" : "•"}
                    </span>

                    <span className="text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
                        {item}
                    </span>
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
        <Surface tone="page" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[rgb(var(--ui-border)/0.72)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <PlayCircle className="h-3.5 w-3.5 text-[rgb(var(--ui-info)/1)]" />
                        <Kicker>{t("introVideoKicker")}</Kicker>
                    </div>

                    <div className="mt-1 truncate text-sm font-semibold text-[rgb(var(--ui-text)/0.96)] sm:text-base">
                        {title}
                    </div>

                    <div className="mt-1 text-xs text-[rgb(var(--ui-text-muted)/0.82)]">
                        {t("introVideoHint")}
                    </div>
                </div>

                <a href={url} target="_blank" rel="noreferrer" className="ui-btn-secondary">
                    {t("openLink")}
                </a>
            </div>

            <div className="p-4">
                <div className="overflow-hidden rounded-xl border border-[rgb(var(--ui-border)/0.72)]">
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

function InfoSection({
                         kicker,
                         title,
                         children,
                     }: {
    kicker: React.ReactNode;
    title: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <Surface tone="page" className="h-full p-4 sm:p-5">
            <Kicker>{kicker}</Kicker>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-[rgb(var(--ui-text)/0.96)]">
                {title}
            </h2>
            <div className="mt-4">{children}</div>
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

    const statusTone: "neutral" | "good" | "warn" =
        completed ? "good" : hasAnyProgress ? "warn" : "neutral";

    const progressPct =
        stats.topicsCount > 0
            ? Math.max(0, Math.min(100, Math.round((completedCount / stats.topicsCount) * 100)))
            : 0;

    const kicker = t("kicker", { subject: subject.title, n: module.order + 1 });
    const videoTitle = t("videoTitle", { module: module.title });

    return (
        <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)] text-[rgb(var(--ui-text)/1)]">
            <div className="ui-container py-4 sm:py-5 lg:py-6">
                <div className="mx-auto max-w-4xl space-y-3">
                    <Surface tone="page" className="p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Link
                                href={backHref}
                                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[rgb(var(--ui-text-muted)/0.88)] transition hover:text-[rgb(var(--ui-text)/1)]"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                {t("actions.back")}
                            </Link>

                            <div className="flex flex-wrap items-center gap-2">
                                <StatusPill tone="neutral">{subject.title}</StatusPill>
                                <StatusPill tone={statusTone}>{statusText}</StatusPill>
                            </div>
                        </div>

                        <div className="mt-3">
                            <Kicker>{kicker}</Kicker>

                            <h1 className="mt-2 text-xl font-semibold tracking-tight text-[rgb(var(--ui-text)/0.96)] sm:text-2xl">
                                {module.title}
                            </h1>

                            {(module.description || subject.description) ? (
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
                                    {module.description ?? subject.description}
                                </p>
                            ) : null}
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="ui-meta">Progress</div>
                                    <div className="ui-meta-strong tabular-nums">
                                        {completedCount}/{stats.topicsCount} • {progressPct}%
                                    </div>
                                </div>

                                <ProgressBar pct={progressPct} />
                            </div>

                            <NavButton
                                href={learnHref}
                                fullWidth
                                prefetch
                                className="ui-btn-primary w-full sm:w-auto"
                            >
                                {ctaLabel}
                            </NavButton>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <CompactMeta label={t("labels.sections")} value={stats.sectionsCount} />
                            <CompactMeta label={t("labels.topics")} value={stats.topicsCount} />
                            <CompactMeta
                                label={t("labels.weeks")}
                                value={
                                    module.weekStart != null || module.weekEnd != null
                                        ? `${module.weekStart ?? "?"}–${module.weekEnd ?? "?"}`
                                        : "—"
                                }
                            />
                            <CompactMeta
                                label={t("labels.est")}
                                value={est != null ? t("minutesShort", { n: est }) : "—"}
                            />
                        </div>
                    </Surface>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.8fr)]">
                        <InfoSection
                            kicker={t("sections.prereqs")}
                            title={prereqs.length ? "Before you start" : "Ready to begin"}
                        >
                            {prereqs.length ? (
                                <BulletList items={prereqs} marker="arrow" />
                            ) : (
                                <Surface tone="muted" className="rounded-xl p-4">
                                    <p className="text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
                                        This module is ready to start with no required prerequisites listed.
                                    </p>
                                </Surface>
                            )}
                        </InfoSection>

                        <Surface tone="page" className="p-4 sm:p-5">
                            <Kicker>{t("labels.status")}</Kicker>

                            <div className="mt-3 grid gap-3">
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            "ui-icon-box h-8 w-8 rounded-full",
                                            completed
                                                ? "border-[rgb(var(--ui-accent)/0.20)] bg-[rgb(var(--ui-accent)/0.10)] text-[rgb(var(--ui-accent)/1)]"
                                                : hasAnyProgress
                                                    ? "border-[rgb(var(--ui-warn)/0.20)] bg-[rgb(var(--ui-warn)/0.10)] text-[rgb(var(--ui-warn)/1)]"
                                                    : "text-[rgb(var(--ui-text-muted)/0.9)]",
                                        )}
                                    >
                                        {completed ? (
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                        ) : hasAnyProgress ? (
                                            <Sparkles className="h-3.5 w-3.5" />
                                        ) : (
                                            <PlayCircle className="h-3.5 w-3.5" />
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-[rgb(var(--ui-text)/0.96)]">
                                            {statusText}
                                        </div>
                                        <div className="mt-1 text-xs text-[rgb(var(--ui-text-muted)/0.84)]">
                                            Module #{module.order + 1}
                                        </div>
                                    </div>
                                </div>

                                <Surface tone="muted" className="rounded-xl p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs text-[rgb(var(--ui-text-muted)/0.84)]">
                                            Topics completed
                                        </span>
                                        <span className="text-sm font-medium tabular-nums text-[rgb(var(--ui-text)/0.96)]">
                                            {completedCount}/{stats.topicsCount}
                                        </span>
                                    </div>
                                </Surface>
                            </div>
                        </Surface>
                    </div>

                    {videoUrl ? <VideoEmbed url={videoUrl} title={videoTitle} /> : null}

                    <div className="grid gap-3 lg:grid-cols-2">
                        <InfoSection kicker={t("sections.whatLearn")} title={t("sections.whatLearn")}>
                            <BulletList items={outcomes} marker="check" />
                        </InfoSection>

                        <InfoSection kicker={t("sections.whyMatters")} title={t("sections.whyMatters")}>
                            <BulletList items={why} marker="dot" />
                        </InfoSection>
                    </div>
                </div>
            </div>
        </div>
    );
}