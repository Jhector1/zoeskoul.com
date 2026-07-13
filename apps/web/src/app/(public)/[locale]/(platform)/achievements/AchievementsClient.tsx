"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
    ArrowLeft,
    Award,
    CheckCircle2,
    Clock3,
    Download,
    Medal,
    Rocket,
    Sparkles,
    BookOpen,
} from "lucide-react";
import { cn } from "@/lib/cn";

type FinishState = {
    status:
        | "in_progress"
        | "more_coming"
        | "reward_ready"
        | "certificate_ready"
        | "certificate_issued";
    message: string | null;
    rewardEligible: boolean;
    certificateEligible: boolean;
    certificateIssued: boolean;
    curriculumComplete: boolean;
};

type AchievementReward = {
    badgeLabel?: string | null;
    badgeDescription?: string | null;
    capstoneHref?: string | null;
    subjectHref?: string | null;
    certificateHref?: string | null;
};

type AchievementItem = {
    subject: {
        id: string;
        slug: string;
        title: string;
        order: number;
        imagePublicId: string | null;
        imageAlt: string | null;
    };
    enrollment: {
        status: "enrolled" | "completed";
        startedAt: string;
        lastSeenAt: string | null;
        completedAt: string | null;
    };
    requireAssignment: boolean;
    eligible: boolean;
    completedAt: string | null;
    progress: {
        modulesTotal: number;
        modulesDone: number;
        assignmentsDone: number;
        percent: number;
    };
    modules: Array<{
        moduleId: string;
        title: string;
        order: number;
        moduleCompleted: boolean;
        assignmentCompleted: boolean;
        completedAt: string | null;
        updatedAt: string | null;
    }>;
    certificate: { id: string; issuedAt: string; completedAt: string | null } | null;

    finishState?: FinishState | null;
    reward?: AchievementReward | null;
};

type Payload = {
    locale: string;
    actor: { isGuest: boolean; userId: string | null; guestId: string | null };
    items: AchievementItem[];
};

function fmt(iso: string | null | undefined, locale: string, emptyLabel: string) {
    if (!iso) return emptyLabel;
    const d = new Date(iso);
    return d.toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function Surface({
                     children,
                     className,
                     tone = "page",
                 }: {
    children: React.ReactNode;
    className?: string;
    tone?: "page" | "default" | "muted" | "success";
}) {
    return (
        <div
            className={cn(
                tone === "muted"
                    ? "ui-surface-muted"
                    : tone === "success"
                        ? "ui-surface-success"
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

function SectionHeader({
                           title,
                           meta,
                           icon,
                       }: {
    title: React.ReactNode;
    meta?: React.ReactNode;
    icon?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    {icon ? <span className="text-[rgb(var(--ui-text-muted)/0.9)]">{icon}</span> : null}
                    <h2 className="ui-title-md text-base sm:text-lg">{title}</h2>
                </div>
            </div>
            {meta ? <div className="ui-meta-strong shrink-0">{meta}</div> : null}
        </div>
    );
}

function StatePill({
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

function EmptyBlock({ children }: { children: React.ReactNode }) {
    return (
        <Surface tone="muted" className="rounded-xl p-4">
            <p className="text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">{children}</p>
        </Surface>
    );
}

function ProgressMeter({ pct, label }: { pct: number; label: string }) {
    const safePct = Math.max(0, Math.min(100, pct));

    return (
        <div className="grid gap-1.5">
            <div className="ui-progress-track h-2">
                <div className="ui-progress-fill" style={{ width: `${safePct}%` }} />
            </div>
            <div className="ui-meta">{label}</div>
        </div>
    );
}

function isRewardUnlocked(it: AchievementItem) {
    const s = it.finishState?.status;
    return (
        Boolean(it.finishState?.rewardEligible) ||
        s === "reward_ready" ||
        s === "certificate_ready" ||
        s === "certificate_issued"
    );
}

function isCertificateUnlocked(it: AchievementItem) {
    const s = it.finishState?.status;
    return (
        Boolean(it.certificate) ||
        Boolean(it.finishState?.certificateEligible) ||
        s === "certificate_ready" ||
        s === "certificate_issued"
    );
}

function isMoreComing(it: AchievementItem) {
    return it.finishState?.status === "more_coming";
}

export default function AchievementsClient() {
    const params = useParams<{ locale: string }>();
    const router = useRouter();
    const t = useTranslations("achievements");
    const locale = params?.locale ?? "en";

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<Payload | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [downloadingSlug, setDownloadingSlug] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        async function run() {
            setLoading(true);
            setErr(null);

            const r = await fetch(`/api/achievements?locale=${encodeURIComponent(locale)}`, {
                cache: "no-store",
            });
            const j = await r.json().catch(() => null);

            if (!alive) return;

            if (!r.ok) {
                setErr(j?.message ?? t("loadFailed"));
                setData(null);
            } else {
                setData(j);
            }

            setLoading(false);
        }

        void run();

        return () => {
            alive = false;
        };
    }, [locale, t]);

    const buckets = useMemo(() => {
        const items = data?.items ?? [];

        const certificates = items.filter((x) => isCertificateUnlocked(x));

        const rewards = items.filter(
            (x) => isRewardUnlocked(x) && !isCertificateUnlocked(x),
        );

        const badges = items.filter((x) => isRewardUnlocked(x));

        const moreComing = items.filter((x) => isMoreComing(x));

        const inProgress = items.filter(
            (x) =>
                !isCertificateUnlocked(x) &&
                !isRewardUnlocked(x) &&
                !isMoreComing(x) &&
                x.enrollment.status !== "completed",
        );

        return { certificates, rewards, badges, moreComing, inProgress };
    }, [data]);

    async function downloadCertificatePdf(subjectSlug: string) {
        try {
            setDownloadingSlug(subjectSlug);

            const r = await fetch(
                `/api/certificates/subject/pdf?subjectSlug=${encodeURIComponent(subjectSlug)}&locale=${encodeURIComponent(locale)}`,
                { cache: "no-store" },
            );

            if (!r.ok) {
                const j = await r.json().catch(() => null);
                throw new Error(j?.message ?? t("downloadFailed"));
            }

            const contentType = r.headers.get("content-type") ?? "";
            if (!contentType.toLowerCase().includes("application/pdf")) {
                throw new Error(t("downloadFailed"));
            }

            const blob = await r.blob();
            const url = window.URL.createObjectURL(blob);

            const a = document.createElement("a");
            a.href = url;
            a.download = `${subjectSlug}-certificate.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            window.URL.revokeObjectURL(url);

            const rr = await fetch(`/api/achievements?locale=${encodeURIComponent(locale)}`, {
                cache: "no-store",
            });
            const jj = await rr.json().catch(() => null);
            if (rr.ok) setData(jj);
        } catch (e: any) {
            alert(e?.message ?? t("downloadFailed"));
        } finally {
            setDownloadingSlug(null);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)]">
                <div className="ui-container py-6">
                    <Surface className="p-5">
                        <div className="ui-kicker">{t("title")}</div>
                        <div className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                            {t("loading")}
                        </div>
                    </Surface>
                </div>
            </div>
        );
    }

    if (err) {
        return (
            <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)]">
                <div className="ui-container py-6">
                    <Surface className="p-5">
                        <SectionHeader title={t("title")} />
                        <div className="mt-3 text-sm text-[rgb(var(--ui-danger)/1)]">{err}</div>
                        <div className="mt-4">
                            <button className="ui-btn-secondary" onClick={() => router.back()}>
                                <span className="inline-flex items-center gap-1.5">
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    {t("back")}
                                </span>
                            </button>
                        </div>
                    </Surface>
                </div>
            </div>
        );
    }

    const items = data?.items ?? [];

    return (
        <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)] text-[rgb(var(--ui-text)/1)]">
            <div className="ui-container py-4 sm:py-5 md:py-6">
                <div className="mx-auto max-w-5xl space-y-3">
                    <Surface className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="ui-kicker">{t("kicker")}</div>
                                <h1 className="ui-title-lg mt-2 text-xl sm:text-2xl">{t("title")}</h1>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
                                    {t("descriptions.hero")}
                                </p>
                            </div>

                            <button className="ui-btn-secondary shrink-0" onClick={() => router.back()}>
                                <span className="inline-flex items-center gap-1.5">
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    {t("back")}
                                </span>
                            </button>
                        </div>
                    </Surface>

                    <div className="grid gap-3 md:grid-cols-3">
                        <Surface className="p-4">
                            <SectionHeader
                                title={t("sections.badges")}
                                meta={`${buckets.badges.length}`}
                                icon={<Medal className="h-4 w-4" />}
                            />
                            <div className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                                {t("descriptions.badges")}
                            </div>
                        </Surface>

                        <Surface className="p-4">
                            <SectionHeader
                                title={t("sections.rewards")}
                                meta={`${buckets.rewards.length}`}
                                icon={<Sparkles className="h-4 w-4" />}
                            />
                            <div className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                                {t("descriptions.rewards")}
                            </div>
                        </Surface>

                        <Surface className="p-4">
                            <SectionHeader
                                title={t("sections.certificates")}
                                meta={`${buckets.certificates.length}`}
                                icon={<Award className="h-4 w-4" />}
                            />
                            <div className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                                {t("descriptions.certificates")}
                            </div>
                        </Surface>
                    </div>

                    <Surface className="p-4 sm:p-5">
                        <SectionHeader
                            title={t("sections.learnerBadges")}
                            meta={t("counts.earned", { count: buckets.badges.length })}
                            icon={<Medal className="h-4 w-4" />}
                        />

                        {buckets.badges.length === 0 ? (
                            <div className="mt-4">
                                <EmptyBlock>
                                    {t("descriptions.noBadges")}
                                </EmptyBlock>
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {buckets.badges.map((it) => (
                                    <Surface
                                        key={`badge-${it.subject.slug}`}
                                        tone="success"
                                        className="rounded-2xl p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--ui-accent)/0.12)] text-[rgb(var(--ui-accent)/1)]">
                                                        <Medal className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-semibold text-[rgb(var(--ui-text)/0.96)]">
                                                            {it.reward?.badgeLabel ?? t("fallbacks.badgeLabel", { subject: it.subject.title })}
                                                        </div>
                                                        <div className="text-xs text-[rgb(var(--ui-text-muted)/0.84)]">
                                                            {it.reward?.badgeDescription ?? t("descriptions.badgeFallback")}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <StatePill tone="good">{t("state.earned")}</StatePill>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                className="ui-btn-secondary"
                                                onClick={() =>
                                                    router.push(
                                                        it.reward?.subjectHref ??
                                                        `/subjects/${it.subject.slug}/modules`,
                                                    )
                                                }
                                            >
                                                {t("actions.openSubject")}
                                            </button>
                                        </div>
                                    </Surface>
                                ))}
                            </div>
                        )}
                    </Surface>

                    <Surface className="p-4 sm:p-5">
                        <SectionHeader
                            title={t("sections.unlockedRewards")}
                            meta={t("counts.ready", { count: buckets.rewards.length })}
                            icon={<Sparkles className="h-4 w-4" />}
                        />

                        {buckets.rewards.length === 0 ? (
                            <div className="mt-4">
                                <EmptyBlock>
                                    {t("descriptions.noRewards")}
                                </EmptyBlock>
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {buckets.rewards.map((it) => (
                                    <Surface
                                        key={`reward-${it.subject.slug}`}
                                        tone="success"
                                        className="rounded-2xl p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="truncate text-sm font-semibold text-[rgb(var(--ui-text)/0.96)] sm:text-base">
                                                        {it.subject.title}
                                                    </div>
                                                    <StatePill tone="good">{t("state.unlocked")}</StatePill>
                                                </div>

                                                <div className="mt-2 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.88)]">
                                                    {it.finishState?.message ?? t("descriptions.rewardFallback")}
                                                </div>
                                            </div>

                                            <div className="shrink-0 text-[rgb(var(--ui-accent)/1)]">
                                                <Sparkles className="h-4 w-4" />
                                            </div>
                                        </div>

                                        <div className="mt-4 flex flex-wrap items-center gap-2">
                                            <button
                                                className="ui-btn-primary"
                                                onClick={() =>
                                                    router.push(
                                                        it.reward?.certificateHref ??
                                                        `/subjects/${it.subject.slug}/certificate`,
                                                    )
                                                }
                                            >
                                                {t("actions.continue")}
                                            </button>

                                            <button
                                                className="ui-btn-secondary"
                                                onClick={() =>
                                                    router.push(
                                                        it.reward?.capstoneHref ??
                                                        `/subjects/${it.subject.slug}/modules`,
                                                    )
                                                }
                                            >
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Rocket className="h-3.5 w-3.5" />
                                                    {t("actions.capstone")}
                                                </span>
                                            </button>
                                        </div>
                                    </Surface>
                                ))}
                            </div>
                        )}
                    </Surface>

                    <Surface className="p-4 sm:p-5">
                        <SectionHeader
                            title={t("sections.certificates")}
                            meta={t("counts.unlocked", { count: buckets.certificates.length })}
                            icon={<Award className="h-4 w-4" />}
                        />

                        {buckets.certificates.length === 0 ? (
                            <div className="mt-4">
                                <EmptyBlock>
                                    {t("descriptions.noCertificates")}
                                </EmptyBlock>
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {buckets.certificates.map((it) => {
                                    const issued = Boolean(it.certificate);

                                    return (
                                        <Surface
                                            key={it.subject.slug}
                                            tone="success"
                                            className="rounded-2xl p-4"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="truncate text-sm font-semibold text-[rgb(var(--ui-text)/0.96)] sm:text-base">
                                                            {it.subject.title}
                                                        </div>
                                                        <StatePill tone="good">
                                                            {issued ? t("state.issued") : t("state.ready")}
                                                        </StatePill>
                                                    </div>

                                                    <div className="mt-2 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.88)]">
                                                        {t("meta.completed", { date: fmt(it.completedAt, locale, t("value.emptyDate")) })}
                                                        {issued ? (
                                                            <> {t("meta.issued", { date: fmt(it.certificate?.issuedAt, locale, t("value.emptyDate")) })}</>
                                                        ) : (
                                                            <> {t("meta.notIssued")}</>
                                                        )}
                                                    </div>

                                                    {issued ? (
                                                        <div className="mt-1 text-xs text-[rgb(var(--ui-text-muted)/0.84)]">
                                                            {t("meta.certificateId")}{" "}
                                                            <span className="font-medium text-[rgb(var(--ui-text)/0.96)]">
                                                                {it.certificate?.id}
                                                            </span>
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <div className="shrink-0 text-[rgb(var(--ui-accent)/1)]">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                </div>
                                            </div>

                                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                                <button
                                                    className={cn(
                                                        "ui-btn-primary",
                                                        downloadingSlug === it.subject.slug &&
                                                        "cursor-not-allowed opacity-60",
                                                    )}
                                                    disabled={downloadingSlug === it.subject.slug}
                                                    onClick={() => downloadCertificatePdf(it.subject.slug)}
                                                >
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Download className="h-3.5 w-3.5" />
                                                        {downloadingSlug === it.subject.slug
                                                            ? t("downloadPreparing")
                                                            : t("downloadPdf")}
                                                    </span>
                                                </button>

                                                <button
                                                    className="ui-btn-secondary"
                                                    onClick={() =>
                                                        router.push(
                                                            it.reward?.certificateHref ??
                                                            `/subjects/${it.subject.slug}/certificate`,
                                                        )
                                                    }
                                                >
                                                    {t("actions.view")}
                                                </button>
                                            </div>
                                        </Surface>
                                    );
                                })}
                            </div>
                        )}
                    </Surface>

                    <Surface className="p-4 sm:p-5">
                        <SectionHeader
                            title={t("sections.moreComing")}
                            meta={`${buckets.moreComing.length}`}
                            icon={<BookOpen className="h-4 w-4" />}
                        />

                        {buckets.moreComing.length === 0 ? (
                            <div className="mt-4">
                                <EmptyBlock>
                                    {t("descriptions.noMoreComing")}
                                </EmptyBlock>
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {buckets.moreComing.map((it) => (
                                    <Surface
                                        key={`coming-${it.subject.slug}`}
                                        tone="default"
                                        className="rounded-2xl p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="truncate text-sm font-semibold text-[rgb(var(--ui-text)/0.96)] sm:text-base">
                                                        {it.subject.title}
                                                    </div>
                                                    <StatePill tone="info">{t("state.moreComing")}</StatePill>
                                                </div>

                                                <div className="mt-2 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.88)]">
                                                    {it.finishState?.message ??
                                                        t("descriptions.completedPublished")}
                                                </div>
                                            </div>

                                            <div className="shrink-0 text-[rgb(var(--ui-accent)/1)]">
                                                <Sparkles className="h-4 w-4" />
                                            </div>
                                        </div>

                                        <div className="mt-4 flex flex-wrap items-center gap-2">
                                            <button
                                                className="ui-btn-secondary"
                                                onClick={() =>
                                                    router.push(`/subjects/${it.subject.slug}/modules`)
                                                }
                                            >
                                                {t("actions.viewSubject")}
                                            </button>
                                        </div>
                                    </Surface>
                                ))}
                            </div>
                        )}
                    </Surface>

                    <Surface className="p-4 sm:p-5">
                        <SectionHeader
                            title={t("sections.inProgress")}
                            meta={`${buckets.inProgress.length}`}
                            icon={<Clock3 className="h-4 w-4" />}
                        />

                        {buckets.inProgress.length === 0 ? (
                            <div className="mt-4">
                                <EmptyBlock>{t("descriptions.noProgress")}</EmptyBlock>
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3">
                                {buckets.inProgress.map((it) => {
                                    const pct = it.progress.percent;

                                    return (
                                        <Surface
                                            key={it.subject.slug}
                                            tone="default"
                                            className="rounded-2xl p-4"
                                        >
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="truncate text-sm font-semibold text-[rgb(var(--ui-text)/0.96)] sm:text-base">
                                                            {it.subject.title}
                                                        </div>
                                                        <StatePill tone="warn">{t("state.inProgress")}</StatePill>
                                                    </div>

                                                    <div className="mt-2 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.88)]">
                                                        {t("meta.modules", {
                                                            done: it.progress.modulesDone,
                                                            total: it.progress.modulesTotal,
                                                        })}
                                                        {it.requireAssignment ? (
                                                            <> {t("meta.assignmentsDone", { count: it.progress.assignmentsDone })}</>
                                                        ) : null}
                                                        <> {t("meta.lastActivity", { date: fmt(it.enrollment.lastSeenAt, locale, t("value.emptyDate")) })}</>
                                                    </div>

                                                    <div className="mt-4">
                                                        <ProgressMeter pct={pct} label={t("counts.completePct", { pct })} />
                                                    </div>
                                                </div>

                                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                    <button
                                                        className="ui-btn-secondary"
                                                        onClick={() =>
                                                            router.push(`/subjects/${it.subject.slug}/modules`)
                                                        }
                                                    >
                                                        {t("actions.continue")}
                                                    </button>
                                                    <button
                                                        className="ui-btn-secondary"
                                                        onClick={() =>
                                                            router.push(`/subjects/${it.subject.slug}/certificate`)
                                                        }
                                                    >
                                                        {t("actions.checklist")}
                                                    </button>
                                                </div>
                                            </div>

                                            {it.modules?.length ? (
                                                <div className="mt-4 grid gap-2">
                                                    {it.modules.map((m) => {
                                                        const ok =
                                                            m.moduleCompleted &&
                                                            (!it.requireAssignment || m.assignmentCompleted);

                                                        return (
                                                            <Surface
                                                                key={m.moduleId}
                                                                tone={ok ? "success" : "muted"}
                                                                className="rounded-xl px-3 py-2"
                                                            >
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-xs font-medium text-[rgb(var(--ui-text)/0.96)]">
                                                                            {m.title}
                                                                        </div>

                                                                        {it.requireAssignment ? (
                                                                            <div className="mt-1 text-[11px] text-[rgb(var(--ui-text-muted)/0.84)]">
                                                                                {t("meta.topicsAssignment", {
                                                                                    topics: m.moduleCompleted ? t("value.done") : t("value.notDone"),
                                                                                    assignment: m.assignmentCompleted ? t("value.done") : t("value.notDone"),
                                                                                })}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>

                                                                    <div
                                                                        className={cn(
                                                                            "shrink-0 text-xs font-medium",
                                                                            ok
                                                                                ? "text-[rgb(var(--ui-accent)/1)]"
                                                                                : "text-[rgb(var(--ui-text-muted)/0.84)]",
                                                                        )}
                                                                    >
                                                                        {ok ? "✓" : "•"}
                                                                    </div>
                                                                </div>
                                                            </Surface>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}
                                        </Surface>
                                    );
                                })}
                            </div>
                        )}
                    </Surface>

                    {items.length === 0 ? (
                        <Surface className="p-4 sm:p-5">
                            <SectionHeader title={t("sections.noEnrollments")} />
                            <div className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                                {t("descriptions.noEnrollments")}
                            </div>
                        </Surface>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
