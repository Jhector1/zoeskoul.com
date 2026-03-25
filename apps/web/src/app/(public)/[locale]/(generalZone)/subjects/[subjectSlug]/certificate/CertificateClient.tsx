// src/app/[locale]/subjects/[subjectSlug]/certificate/CertificateClient.tsx
"use client";

import React, {useEffect, useMemo, useState} from "react";
import {useParams} from "next/navigation";
import {useRouter} from "@/i18n/navigation";
import {cn} from "@/lib/cn";

type Status = {
    eligible: boolean;
    requireAssignment: boolean;
    subject: { slug: string; title: string };
    locale: string;
    completedAt: string | null;
    displayName: string;
    modules: Array<{
        moduleId: string;
        title: string;
        moduleCompleted: boolean;
        assignmentCompleted: boolean;
    }>;
    certificate: { id: string; issuedAt: string; completedAt: string | null } | null;
    actor: { isGuest: boolean };};
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME;
export default function CertificateClient() {
    const params = useParams<{ locale: string; subjectSlug: string }>();
    const router = useRouter();

    const locale = params?.locale ?? "en";
    const subjectSlug = params?.subjectSlug ?? "";

    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<Status | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        let alive = true;

        async function run() {
            setLoading(true);
            setErr(null);

            const r = await fetch(
                `/api/certificates/subject?subjectSlug=${encodeURIComponent(subjectSlug)}&locale=${encodeURIComponent(locale)}`,
                {cache: "no-store"},
            );
            const data = await r.json().catch(() => null);

            if (!alive) return;

            if (!r.ok) {
                setErr(data?.message ?? "Unable to load certificate status.");
                setStatus(null);
            } else {
                setStatus(data);
            }
            setLoading(false);
        }

        if (subjectSlug) void run();
        return () => {
            alive = false;
        };
    }, [subjectSlug, locale]);

    const nextSteps = useMemo(() => {
        return [
            {
                title: "Start the next course",
                body: "Keep momentum — pick your next module set and continue practicing."
            },
            {title: "Practice for 10 minutes/day", body: "Consistency beats cramming. Build a daily streak."},
            {title: "Do a project", body: "Use what you learned in a small real project and ship it."},
        ];
    }, []);

    async function downloadPdf() {
        if (!status?.eligible) return;

        try {
            setDownloading(true);

            const r = await fetch(
                `/api/certificates/subject/pdf?subjectSlug=${encodeURIComponent(subjectSlug)}&locale=${encodeURIComponent(locale)}`,
                {cache: "no-store"},
            );

            if (!r.ok) {
                const data = await r.json().catch(() => null);
                throw new Error(data?.message ?? "Download failed.");
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

            // refresh status so "certificate" object becomes available after first issue
            const rr = await fetch(
                `/api/certificates/subject?subjectSlug=${encodeURIComponent(subjectSlug)}&locale=${encodeURIComponent(locale)}`,
                {cache: "no-store"},
            );
            const dd = await rr.json().catch(() => null);
            if (rr.ok) setStatus(dd);
        } catch (e: any) {
            alert(e?.message ?? "Unable to download certificate.");
        } finally {
            setDownloading(false);
        }
    }

    if (loading) {
        return <div className="p-6 text-sm text-neutral-600 dark:text-white/70">Loading…</div>;
    }

    if (err) {
        return (
            <div className="min-h-screen p-6">
                <div className="ui-card p-5">
                    <div className="text-lg font-black">Certificate</div>
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

    const eligible = Boolean(status?.eligible);
    const completionDateStr = status?.completedAt
        ? new Date(status.completedAt).toLocaleDateString("en-US", {year: "numeric", month: "long", day: "numeric"})
        : "—";

    const issuedDateStr = status?.certificate?.issuedAt
        ? new Date(status.certificate.issuedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric"
        })
        : "—";
    const previewName = eligible
        ? (status?.displayName ?? "Learner")
        : (status?.actor?.isGuest ? "Guest Learner" : "Learner");
    return (
        <div
            className="min-h-screen bg-[radial-gradient(1200px_700px_at_20%_0%,#eafff5_0%,#ffffff_55%,#f6f7ff_100%)] dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-neutral-900 dark:text-white/90">
            <div className="ui-container py-6 grid gap-4">
                <div className={cn("ui-card p-5 md:p-6", eligible ? "border-emerald-600/25" : "border-neutral-200")}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-black text-neutral-600 dark:text-white/60">Course Certificate
                            </div>
                            <div className="mt-1 text-2xl font-black tracking-tight">
                                {eligible ? "🎉 Congratulations!" : "Almost there"}
                            </div>

                            <div className="mt-2 text-sm text-neutral-700 dark:text-white/70">
                                {eligible ? (
                                    <>
                                        You completed <span className="font-extrabold">{status?.subject.title}</span>.
                                        Download your
                                        certificate and keep going.
                                    </>
                                ) : (
                                    <>
                                        Finish all modules{status?.requireAssignment ? " + module assignments" : ""} to
                                        unlock your
                                        certificate for <span className="font-extrabold">{status?.subject.title}</span>.
                                    </>
                                )}
                            </div>

                            {status?.certificate ? (
                                <div className="mt-3 text-xs text-neutral-600 dark:text-white/60">
                                    Issued certificate: <span className="font-black">{status.certificate.id}</span>
                                </div>
                            ) : null}
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                            <button className="ui-btn ui-btn-secondary" onClick={() => router.back()}>
                                ← Back
                            </button>

                            <button
                                className={cn("ui-btn ui-btn-primary", (!eligible || downloading) && "opacity-60 cursor-not-allowed")}
                                disabled={!eligible || downloading}
                                aria-disabled={!eligible || downloading}
                                onClick={downloadPdf}
                            >
                                {downloading ? "Preparing…" : "Download PDF"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ✅ Always-visible preview (locks when not eligible) */}
                <div className="ui-card p-5 overflow-hidden">
                    <div className="text-lg font-black">Certificate Preview</div>

                    <div
                        className={cn(
                            "mt-3 rounded-2xl border bg-white dark:bg-white/[0.04] dark:border-white/10 relative overflow-hidden",
                            !eligible && "opacity-70",
                        )}
                    >
                        {!eligible && (
                            <div
                                className="absolute inset-0 z-20 grid place-items-center bg-white/60 dark:bg-black/40 backdrop-blur-[1px]">
                                <div className="ui-card px-4 py-2 text-sm font-extrabold">Finish the checklist to
                                    unlock
                                </div>
                            </div>
                        )}

                        {/* Aspect ratio close to Letter landscape (11 x 8.5) */}
                        <div className="relative mx-auto w-full max-w-[980px] aspect-[11/8.5] p-6 md:p-8">
                            {/* Subtle wave background (CSS-only) */}
                            <div className="absolute inset-0 opacity-[0.16] pointer-events-none">
                                <div className="absolute -left-24 top-10 h-[140%] w-[140%] rotate-[-8deg]">
                                    <div
                                        className="h-full w-full bg-[repeating-linear-gradient(0deg,transparent_0px,transparent_18px,rgba(148,163,184,0.6)_19px,transparent_20px)]"/>
                                </div>
                            </div>

                            {/* Watermark */}
                            <div className="absolute inset-0 grid place-items-center pointer-events-none">
                                <div
                                    className="text-[64px] md:text-[88px] font-black tracking-widest text-neutral-900/5 dark:text-white/5 rotate-[-12deg]"
                                    style={{fontFamily: "var(--font-playfair)"}}
                                >
                                    {String(APP_NAME).toUpperCase()}
                                </div>
                            </div>

                            {/* Gold frame */}
                            <div className="absolute inset-3 rounded-[18px] border-[3px] border-[#C9A227]"/>
                            <div
                                className="absolute inset-[18px] rounded-[14px] border border-neutral-200/80 dark:border-white/10"/>

                            {/* Corner ornaments */}
                            {[
                                "left-[14px] top-[14px]",
                                "right-[14px] top-[14px]",
                                "left-[14px] bottom-[14px]",
                                "right-[14px] bottom-[14px]",
                            ].map((pos) => (
                                <div key={pos} className={cn("absolute h-3 w-3 border border-[#B88B1D]", pos)}/>
                            ))}

                            {/* Content */}
                            <div className="relative h-full flex flex-col items-center justify-center text-center px-6">
                                <div
                                    className="text-[11px] font-extrabold tracking-[0.22em] text-slate-600 dark:text-white/60">
                                    {String(APP_NAME).toUpperCase()}
                                </div>

                                <div className="mt-1 text-xs text-slate-500 dark:text-white/50">
                                    {status?.subject.title}
                                </div>

                                <div
                                    className="mt-6 text-[44px] md:text-[58px] leading-none text-slate-950 dark:text-white"
                                    style={{fontFamily: "var(--font-playfair)"}}
                                >
                                    CERTIFICATE
                                </div>

                                <div
                                    className="mt-1 text-[18px] md:text-[22px] text-slate-950/90 dark:text-white/90"
                                    style={{fontFamily: "var(--font-playfair)"}}
                                >
                                    OF COMPLETION
                                </div>

                                {/* Gold separator */}
                                <div className="mt-4 h-[2px] w-40 bg-[#C9A227]"/>

                                <div className="mt-6 text-sm text-slate-700 dark:text-white/70">
                                    This certificate is proudly presented to
                                </div>

                                {/* Name (script) */}
                                <div
                                    className="mt-3 text-[44px] md:text-[58px] leading-none text-slate-950 dark:text-white"
                                    style={{fontFamily: "var(--font-script)"}}
                                >
                                    {previewName}
                                </div>
                                    {/* Dotted gold line */}
                                    <div className="mt-3 w-[70%] border-t border-dashed border-[#C9A227]"/>

                                    <div className="mt-5 text-sm text-slate-700 dark:text-white/70">
                                        for the successful completion of
                                    </div>

                                    <div
                                        className="mt-2 text-xl md:text-2xl font-extrabold text-slate-950 dark:text-white">
                                        {status?.subject.title}
                                    </div>

                                    {/* Bottom row */}
                                    <div className="mt-auto w-full grid grid-cols-3 items-end gap-3 pt-6">
                                        {/* Date */}
                                        <div className="text-left">
                                            <div className="h-px bg-neutral-300 dark:bg-white/10 mb-2"/>
                                            <div className="text-xs text-slate-500 dark:text-white/50">Date awarded
                                            </div>
                                            <div className="text-sm font-bold text-slate-900 dark:text-white">
                                                {completionDateStr}
                                            </div>
                                        </div>

                                        {/* Seal */}
                                        <div className="flex justify-center">
                                            <div
                                                className="h-16 w-16 rounded-full border-2 border-[#C9A227] bg-[#fff8e1] dark:bg-white/5 grid place-items-center">
                                                <div className="text-[10px] font-black text-[#B88B1D]">VERIFIED</div>
                                            </div>
                                        </div>

                                        {/* Signature */}
                                        <div className="text-right">
                                            <div className="h-px bg-neutral-300 dark:bg-white/10 mb-2"/>
                                            <div className="text-xs text-slate-500 dark:text-white/50">Name / Position
                                            </div>
                                            <div className="text-sm font-bold text-slate-900 dark:text-white">Program
                                                Director
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer tiny meta */}
                                    <div
                                        className="mt-3 w-full flex justify-between text-[11px] text-slate-500 dark:text-white/50">
                                        {/*<div> <div>Verified by course progress records</div>*/}
                                            <span>Issued: {issuedDateStr}</span>
                                    {/*</div>*/}

                                        <span>{status?.certificate ? `Certificate ID: ${status.certificate.id}` : ""}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="ui-card p-5">
                        <div className="text-lg font-black">Checklist</div>
                        <div className="mt-3 grid gap-2">
                            {status?.modules?.map((m) => {
                                const ok = m.moduleCompleted && (!status.requireAssignment || m.assignmentCompleted);
                                return (
                                    <div
                                        key={m.moduleId}
                                        className={cn(
                                            "rounded-xl border px-3 py-2 text-sm flex items-center justify-between gap-2",
                                            ok
                                                ? "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10"
                                                : "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]",
                                        )}
                                    >
                                        <div className="min-w-0">
                                            <div className="font-extrabold truncate">{m.title}</div>
                                            {status.requireAssignment ? (
                                                <div className="text-xs text-neutral-600 dark:text-white/60">
                                                    Topics: {m.moduleCompleted ? "done" : "not done"} • Assignment:{" "}
                                                    {m.assignmentCompleted ? "done" : "not done"}
                                                </div>
                                            ) : null}
                                        </div>
                                        <div
                                            className={cn(
                                                "text-xs font-black",
                                                ok ? "text-emerald-700 dark:text-emerald-200" : "text-neutral-500 dark:text-white/60",
                                            )}
                                        >
                                            {ok ? "✓ Complete" : "In progress"}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="ui-card p-5">
                        <div className="text-lg font-black">Next steps</div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                            {nextSteps.map((s) => (
                                <div
                                    key={s.title}
                                    className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]"
                                >
                                    <div className="font-extrabold">{s.title}</div>
                                    <div className="mt-1 text-sm text-neutral-600 dark:text-white/60">{s.body}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            );
            }