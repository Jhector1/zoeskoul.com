"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, Award, CheckCircle2, Download, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import CertificatePreviewCard from "./_components/CertificatePreviewCard";

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
    actor: { isGuest: boolean };
};

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

function Pill({
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

function SectionHeader({
                           title,
                           icon,
                           meta,
                       }: {
    title: React.ReactNode;
    icon?: React.ReactNode;
    meta?: React.ReactNode;
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
                { cache: "no-store" },
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

    const nextSteps = useMemo(
        () => [
            {
                title: "Start the next course",
                body: "Keep momentum and continue learning with your next subject.",
            },
            {
                title: "Practice regularly",
                body: "A short daily practice routine will help the material stick.",
            },
            {
                title: "Build a small project",
                body: "Use what you learned in something real and finish it.",
            },
        ],
        [],
    );

    async function downloadPdf() {
        if (!status?.eligible) return;

        try {
            setDownloading(true);

            const r = await fetch(
                `/api/certificates/subject/pdf?subjectSlug=${encodeURIComponent(subjectSlug)}&locale=${encodeURIComponent(locale)}`,
                { cache: "no-store" },
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

            const rr = await fetch(
                `/api/certificates/subject?subjectSlug=${encodeURIComponent(subjectSlug)}&locale=${encodeURIComponent(locale)}`,
                { cache: "no-store" },
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
        return (
            <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)]">
                <div className="ui-container py-4 sm:py-5 md:py-6">
                    <div className="mx-auto max-w-4xl">
                        <Surface className="p-4 sm:p-5">
                            <div className="ui-kicker">Certificate</div>
                            <div className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                                Loading…
                            </div>
                        </Surface>
                    </div>
                </div>
            </div>
        );
    }

    if (err) {
        return (
            <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)]">
                <div className="ui-container py-4 sm:py-5 md:py-6">
                    <div className="mx-auto max-w-4xl">
                        <Surface className="p-4 sm:p-5">
                            <SectionHeader title="Certificate" />
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
            </div>
        );
    }

    const eligible = Boolean(status?.eligible);

    const completionDateStr = status?.completedAt
        ? new Date(status.completedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        })
        : "—";

    const issuedDateStr = status?.certificate?.issuedAt
        ? new Date(status.certificate.issuedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        })
        : "—";

    const previewName = eligible
        ? (status?.displayName ?? "Learner")
        : (status?.actor?.isGuest ? "Guest Learner" : "Learner");

    return (
        <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)] text-[rgb(var(--ui-text)/1)]">
            <div className="ui-container py-4 sm:py-5 md:py-6">
                <div className="mx-auto max-w-4xl space-y-3">
                    <Surface className="p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <div className="ui-kicker">Course Certificate</div>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Pill tone={eligible ? "good" : "warn"}>
                                        {eligible ? "Unlocked" : "In progress"}
                                    </Pill>

                                    {status?.certificate ? <Pill tone="info">Issued</Pill> : null}
                                </div>

                                <h1 className="ui-title-lg mt-3 text-xl sm:text-2xl">
                                    {eligible ? "Congratulations" : "Almost there"}
                                </h1>

                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
                                    {eligible ? (
                                        <>
                                            You completed{" "}
                                            <span className="font-medium text-[rgb(var(--ui-text)/0.96)]">
                                                {status?.subject.title}
                                            </span>
                                            . Your certificate is ready.
                                        </>
                                    ) : (
                                        <>
                                            Finish all modules
                                            {status?.requireAssignment ? " and required assignments" : ""}
                                            {" "}to unlock the certificate for{" "}
                                            <span className="font-medium text-[rgb(var(--ui-text)/0.96)]">
                                                {status?.subject.title}
                                            </span>
                                            .
                                        </>
                                    )}
                                </p>

                                {status?.certificate ? (
                                    <div className="mt-2 text-xs text-[rgb(var(--ui-text-muted)/0.84)]">
                                        Certificate ID:{" "}
                                        <span className="font-medium text-[rgb(var(--ui-text)/0.96)]">
                                            {status.certificate.id}
                                        </span>
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <button className="ui-btn-secondary" onClick={() => router.back()}>
                                    <span className="inline-flex items-center gap-1.5">
                                        <ArrowLeft className="h-3.5 w-3.5" />
                                        Back
                                    </span>
                                </button>

                                <button
                                    className={cn(
                                        "ui-btn-primary",
                                        (!eligible || downloading) && "cursor-not-allowed opacity-60",
                                    )}
                                    disabled={!eligible || downloading}
                                    aria-disabled={!eligible || downloading}
                                    onClick={downloadPdf}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <Download className="h-3.5 w-3.5" />
                                        {downloading ? "Preparing…" : "Download PDF"}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </Surface>

                    <Surface className="p-4 sm:p-5">
                        <SectionHeader
                            title="Certificate Preview"
                            icon={<Award className="h-4 w-4" />}
                            meta={eligible ? "Unlocked" : "Locked"}
                        />

                        <div className="mt-4">
                            <CertificatePreviewCard
                                eligible={eligible}
                                previewName={previewName}
                                subjectTitle={status?.subject.title ?? "Course"}
                                completionDateStr={completionDateStr}
                                issuedDateStr={issuedDateStr}
                                certificateId={status?.certificate?.id ?? null}
                            />
                        </div>
                    </Surface>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.12fr)_minmax(240px,0.88fr)]">
                        <Surface className="p-4 sm:p-5">
                            <SectionHeader
                                title="Checklist"
                                icon={
                                    eligible ? (
                                        <CheckCircle2 className="h-4 w-4" />
                                    ) : (
                                        <Lock className="h-4 w-4" />
                                    )
                                }
                                meta={`${status?.modules?.length ?? 0} modules`}
                            />

                            <div className="mt-4 grid gap-2">
                                {status?.modules?.map((m) => {
                                    const ok =
                                        m.moduleCompleted &&
                                        (!status.requireAssignment || m.assignmentCompleted);

                                    return (
                                        <Surface
                                            key={m.moduleId}
                                            tone={ok ? "success" : "muted"}
                                            className="rounded-xl px-3 py-2.5"
                                        >
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-medium text-[rgb(var(--ui-text)/0.96)]">
                                                        {m.title}
                                                    </div>

                                                    {status.requireAssignment ? (
                                                        <div className="mt-1 text-[11px] leading-5 text-[rgb(var(--ui-text-muted)/0.84)]">
                                                            Topics: {m.moduleCompleted ? "done" : "not done"} • Assignment:{" "}
                                                            {m.assignmentCompleted ? "done" : "not done"}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <div className="shrink-0">
                                                    <Pill tone={ok ? "good" : "neutral"}>
                                                        {ok ? "Complete" : "In progress"}
                                                    </Pill>
                                                </div>
                                            </div>
                                        </Surface>
                                    );
                                })}
                            </div>
                        </Surface>

                        <Surface className="p-4 sm:p-5">
                            <SectionHeader
                                title="Next steps"
                                icon={<Sparkles className="h-4 w-4" />}
                            />

                            <div className="mt-4 grid gap-2">
                                {nextSteps.map((step) => (
                                    <Surface key={step.title} tone="muted" className="rounded-xl p-3">
                                        <div className="text-sm font-medium text-[rgb(var(--ui-text)/0.96)]">
                                            {step.title}
                                        </div>
                                        <div className="mt-1 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.88)]">
                                            {step.body}
                                        </div>
                                    </Surface>
                                ))}
                            </div>
                        </Surface>
                    </div>
                </div>
            </div>
        </div>
    );
}