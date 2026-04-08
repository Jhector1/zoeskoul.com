"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, Award, CheckCircle2, Clock3, Download } from "lucide-react";
import { cn } from "@/lib/cn";

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
};

type Payload = {
    locale: string;
    actor: { isGuest: boolean; userId: string | null; guestId: string | null };
    items: AchievementItem[];
};

function fmt(iso: string | null | undefined) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
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

function ProgressMeter({ pct }: { pct: number }) {
    const safePct = Math.max(0, Math.min(100, pct));

    return (
        <div className="grid gap-1.5">
            <div className="ui-progress-track h-2">
                <div className="ui-progress-fill" style={{ width: `${safePct}%` }} />
            </div>
            <div className="ui-meta">{safePct}% complete</div>
        </div>
    );
}

export default function AchievementsClient() {
    const params = useParams<{ locale: string }>();
    const router = useRouter();
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
                setErr(j?.message ?? "Unable to load achievements.");
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
    }, [locale]);

    const buckets = useMemo(() => {
        const items = data?.items ?? [];

        const certificates = items.filter((x) => x.eligible || Boolean(x.certificate));

        const completedButUnsynced = items.filter(
            (x) =>
                !x.eligible &&
                !x.certificate &&
                x.enrollment.status === "completed",
        );

        const inProgress = items.filter(
            (x) =>
                !x.eligible &&
                !x.certificate &&
                x.enrollment.status !== "completed",
        );

        return { certificates, completedButUnsynced, inProgress };
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
                throw new Error(j?.message ?? "Download failed.");
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
            alert(e?.message ?? "Unable to download certificate.");
        } finally {
            setDownloadingSlug(null);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)]">
                <div className="ui-container py-6">
                    <Surface className="p-5">
                        <div className="ui-kicker">Achievements</div>
                        <div className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                            Loading…
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
                        <SectionHeader title="Achievements" />
                        <div className="mt-3 text-sm text-[rgb(var(--ui-danger)/1)]">{err}</div>
                        <div className="mt-4">
                            <button className="ui-btn-secondary" onClick={() => router.back()}>
                                <span className="inline-flex items-center gap-1.5">
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    Back
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
                                <div className="ui-kicker">Your learning</div>
                                <h1 className="ui-title-lg mt-2 text-xl sm:text-2xl">Achievements</h1>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
                                    Certificates appear when you finish every module
                                    {items[0]?.requireAssignment ? " and required assignments." : "."}
                                </p>
                            </div>

                            <button className="ui-btn-secondary shrink-0" onClick={() => router.back()}>
                                <span className="inline-flex items-center gap-1.5">
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    Back
                                </span>
                            </button>
                        </div>
                    </Surface>

                    <Surface className="p-4 sm:p-5">
                        <SectionHeader
                            title="Certificates"
                            meta={`${buckets.certificates.length} unlocked`}
                            icon={<Award className="h-4 w-4" />}
                        />

                        {buckets.certificates.length === 0 ? (
                            <div className="mt-4">
                                {buckets.completedButUnsynced.length > 0 ? (
                                    <EmptyBlock>
                                        You have completed subject{buckets.completedButUnsynced.length > 1 ? "s" : ""}, but certificate status has not synced yet.
                                        Open the certificate page for that subject or refresh this page.
                                    </EmptyBlock>
                                ) : (
                                    <EmptyBlock>
                                        No certificates yet. Keep going — your unlocked certificates will appear here.
                                    </EmptyBlock>
                                )}
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
                                                            {issued ? "Issued" : "Ready"}
                                                        </StatePill>
                                                    </div>

                                                    <div className="mt-2 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.88)]">
                                                        Completed: {fmt(it.completedAt)}
                                                        {issued ? (
                                                            <> • Issued: {fmt(it.certificate?.issuedAt)}</>
                                                        ) : (
                                                            <> • Not issued yet</>
                                                        )}
                                                    </div>

                                                    {issued ? (
                                                        <div className="mt-1 text-xs text-[rgb(var(--ui-text-muted)/0.84)]">
                                                            Certificate ID:{" "}
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
                                                            ? "Preparing…"
                                                            : "Download PDF"}
                                                    </span>
                                                </button>

                                                <button
                                                    className="ui-btn-secondary"
                                                    onClick={() =>
                                                        router.push(`/subjects/${it.subject.slug}/certificate`)
                                                    }
                                                >
                                                    View
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
                            title="In progress"
                            meta={
                                buckets.completedButUnsynced.length > 0
                                    ? `${buckets.certificates.length} unlocked • ${buckets.completedButUnsynced.length} completed`
                                    : `${buckets.certificates.length} unlocked`
                            }                            icon={<Clock3 className="h-4 w-4" />}
                        />

                        {buckets.inProgress.length === 0 ? (
                            <div className="mt-4">
                                <EmptyBlock>Nothing in progress right now.</EmptyBlock>
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
                                                        <StatePill tone="warn">In progress</StatePill>
                                                    </div>

                                                    <div className="mt-2 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.88)]">
                                                        Modules: {it.progress.modulesDone}/{it.progress.modulesTotal}
                                                        {it.requireAssignment ? (
                                                            <> • Assignments done: {it.progress.assignmentsDone}</>
                                                        ) : null}
                                                        <> • Last activity: {fmt(it.enrollment.lastSeenAt)}</>
                                                    </div>

                                                    <div className="mt-4">
                                                        <ProgressMeter pct={pct} />
                                                    </div>
                                                </div>

                                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                                    <button
                                                        className="ui-btn-secondary"
                                                        onClick={() =>
                                                            router.push(`/subjects/${it.subject.slug}/modules`)
                                                        }
                                                    >
                                                        Continue
                                                    </button>
                                                    <button
                                                        className="ui-btn-secondary"
                                                        onClick={() =>
                                                            router.push(`/subjects/${it.subject.slug}/certificate`)
                                                        }
                                                    >
                                                        Checklist
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
                                                                                Topics:{" "}
                                                                                {m.moduleCompleted ? "done" : "not done"} •
                                                                                Assignment:{" "}
                                                                                {m.assignmentCompleted
                                                                                    ? "done"
                                                                                    : "not done"}
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
                            <SectionHeader title="No enrollments yet" />
                            <div className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                                Enroll in a subject to start tracking progress and earning certificates.
                            </div>
                        </Surface>
                    ) : null}
                </div>
            </div>
        </div>
    );
}