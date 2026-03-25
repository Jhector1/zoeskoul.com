// src/app/[locale]/achievements/AchievementsClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
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
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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
        const certificates = items.filter((x) => x.eligible);
        const inProgress = items.filter((x) => !x.eligible);
        return { certificates, inProgress };
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

            // refresh achievements so certificate becomes "issued" after first download
            const rr = await fetch(`/api/achievements?locale=${encodeURIComponent(locale)}`, { cache: "no-store" });
            const jj = await rr.json().catch(() => null);
            if (rr.ok) setData(jj);
        } catch (e: any) {
            alert(e?.message ?? "Unable to download certificate.");
        } finally {
            setDownloadingSlug(null);
        }
    }

    if (loading) {
        return <div className="p-6 text-sm text-neutral-600 dark:text-white/70">Loading…</div>;
    }

    if (err) {
        return (
            <div className="min-h-screen p-6">
                <div className="ui-card p-5">
                    <div className="text-lg font-black">Achievements</div>
                    <div className="mt-2 text-sm text-rose-700 dark:text-rose-200">{err}</div>
                    <div className="mt-4">
                        <button className="ui-btn ui-btn-secondary" onClick={() => router.back()}>
                            ← Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const items = data?.items ?? [];

    return (
        <div className="min-h-screen bg-[radial-gradient(1200px_700px_at_20%_0%,#eafff5_0%,#ffffff_55%,#f6f7ff_100%)] dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-neutral-900 dark:text-white/90">
            <div className="ui-container py-6 grid gap-4">
                <div className="ui-card p-5 md:p-6">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm font-black text-neutral-600 dark:text-white/60">Your learning</div>
                            <div className="mt-1 text-2xl font-black tracking-tight">Achievements</div>
                            <div className="mt-2 text-sm text-neutral-700 dark:text-white/70">
                                Certificates appear when you finish every module{items[0]?.requireAssignment ? " + assignments" : ""}.
                            </div>
                        </div>

                        <button className="ui-btn ui-btn-secondary shrink-0" onClick={() => router.back()}>
                            ← Back
                        </button>
                    </div>
                </div>

                {/* Certificates */}
                <div className="ui-card p-5">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-lg font-black">Certificates</div>
                        <div className="text-xs font-black text-neutral-500 dark:text-white/60">
                            {buckets.certificates.length} unlocked
                        </div>
                    </div>

                    {buckets.certificates.length === 0 ? (
                        <div className="mt-3 text-sm text-neutral-600 dark:text-white/60">
                            No certificates yet — keep going. Your unlocked certificates will show here.
                        </div>
                    ) : (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {buckets.certificates.map((it) => {
                                const issued = Boolean(it.certificate);
                                return (
                                    <div
                                        key={it.subject.slug}
                                        className="rounded-2xl border border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10 p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-extrabold truncate">{it.subject.title}</div>
                                                <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">
                                                    Completed: {fmt(it.completedAt)}
                                                    {issued ? <> • Issued: {fmt(it.certificate?.issuedAt)}</> : <> • Not issued yet</>}
                                                </div>
                                                {issued ? (
                                                    <div className="mt-2 text-xs text-neutral-600 dark:text-white/60">
                                                        Certificate ID: <span className="font-black">{it.certificate?.id}</span>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="shrink-0 flex items-center gap-2">
                                                <button
                                                    className={cn(
                                                        "ui-btn ui-btn-primary",
                                                        downloadingSlug === it.subject.slug && "opacity-60 cursor-not-allowed",
                                                    )}
                                                    disabled={downloadingSlug === it.subject.slug}
                                                    onClick={() => downloadCertificatePdf(it.subject.slug)}
                                                >
                                                    {downloadingSlug === it.subject.slug ? "Preparing…" : "Download PDF"}
                                                </button>
                                                <button
                                                    className="ui-btn ui-btn-secondary"
                                                    onClick={() => router.push(`/subjects/${it.subject.slug}/certificate`)}
                                                >
                                                    View
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* In progress */}
                <div className="ui-card p-5">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-lg font-black">In progress</div>
                        <div className="text-xs font-black text-neutral-500 dark:text-white/60">
                            {buckets.inProgress.length} active
                        </div>
                    </div>

                    {buckets.inProgress.length === 0 ? (
                        <div className="mt-3 text-sm text-neutral-600 dark:text-white/60">
                            Nothing in progress right now.
                        </div>
                    ) : (
                        <div className="mt-3 grid gap-3">
                            {buckets.inProgress.map((it) => {
                                const pct = it.progress.percent;
                                return (
                                    <div
                                        key={it.subject.slug}
                                        className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-extrabold truncate">{it.subject.title}</div>
                                                <div className="mt-1 text-xs text-neutral-600 dark:text-white/60">
                                                    Modules: {it.progress.modulesDone}/{it.progress.modulesTotal}
                                                    {it.requireAssignment ? <> • Assignments done: {it.progress.assignmentsDone}</> : null}
                                                    <> • Last activity: {fmt(it.enrollment.lastSeenAt)}</>
                                                </div>

                                                <div className="mt-3">
                                                    <div className="h-2 rounded-full bg-neutral-200 dark:bg-white/10 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-emerald-600/70 dark:bg-emerald-300/60"
                                                            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                                                        />
                                                    </div>
                                                    <div className="mt-1 text-xs text-neutral-500 dark:text-white/60">{pct}% complete</div>
                                                </div>
                                            </div>

                                            <div className="shrink-0 flex items-center gap-2">
                                                <button
                                                    className="ui-btn ui-btn-secondary"
                                                    onClick={() => router.push(`/subjects/${it.subject.slug}/modules`)}
                                                >
                                                    Continue
                                                </button>
                                                <button
                                                    className="ui-btn ui-btn-secondary"
                                                    onClick={() => router.push(`/subjects/${it.subject.slug}/certificate`)}
                                                >
                                                    Checklist
                                                </button>
                                            </div>
                                        </div>

                                        {/* Optional: mini checklist */}
                                        {it.modules?.length ? (
                                            <div className="mt-4 grid gap-2">
                                                {it.modules.map((m) => {
                                                    const ok = m.moduleCompleted && (!it.requireAssignment || m.assignmentCompleted);
                                                    return (
                                                        <div
                                                            key={m.moduleId}
                                                            className={cn(
                                                                "rounded-xl border px-3 py-2 text-xs flex items-center justify-between gap-2",
                                                                ok
                                                                    ? "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10"
                                                                    : "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.02]",
                                                            )}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="font-black truncate">{m.title}</div>
                                                                {it.requireAssignment ? (
                                                                    <div className="text-[11px] text-neutral-600 dark:text-white/60">
                                                                        Topics: {m.moduleCompleted ? "done" : "not done"} • Assignment:{" "}
                                                                        {m.assignmentCompleted ? "done" : "not done"}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                            <div
                                                                className={cn(
                                                                    "font-black",
                                                                    ok ? "text-emerald-700 dark:text-emerald-200" : "text-neutral-500 dark:text-white/60",
                                                                )}
                                                            >
                                                                {ok ? "✓" : "•"}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Empty state if no enrollments */}
                {items.length === 0 ? (
                    <div className="ui-card p-5">
                        <div className="text-lg font-black">No enrollments yet</div>
                        <div className="mt-2 text-sm text-neutral-600 dark:text-white/60">
                            Enroll in a subject to start tracking progress and earning certificates.
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}