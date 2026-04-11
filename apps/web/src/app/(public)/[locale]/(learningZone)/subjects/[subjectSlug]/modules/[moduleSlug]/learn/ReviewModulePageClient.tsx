"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

import ReviewModuleNavBar from "@/components/review/ReviewModuleNavBar";

import type { ReviewModule } from "@/lib/subjects/types";
import { getReviewModule } from "@/lib/subjects/registry";
import ReviewModuleView from "@/components/review/module/ReviewModuleView";
import { ROUTES } from "@/utils";
import { buildBillingHref } from "@/lib/billing/moduleAccess";

type NavInfo = {
    prevModuleId: string | null;
    nextModuleId: string | null;
    nextLocked?: boolean;
    index: number;
    total: number;
};

type SubjectFinishState = {
    subjectSlug: string;
    currentModuleSlug: string | null;
    curriculumState: "growing" | "complete";
    curriculumComplete: boolean;
    publishedModuleCount: number;
    plannedModuleCount: number | null;
    lastPublishedModuleSlug: string | null;
    atEndOfPublishedTrack: boolean;
    completedPublishedModuleCount: number;
    remainingPublishedModuleCount: number;
    rewardEnabled: boolean;
    certificateEnabled: boolean;
    rewardEligible: boolean;
    certificateEligible: boolean;
    certificateIssued: boolean;
    status:
        | "in_progress"
        | "more_coming"
        | "reward_ready"
        | "certificate_ready"
        | "certificate_issued";
    message: string | null;
};

export default function ReviewModulePageClient({ canUnlockAll }: { canUnlockAll: boolean }) {
    const params = useParams<{ locale: string; subjectSlug: string; moduleSlug: string }>();

    const locale = params?.locale ?? "en";
    const subjectSlug = params?.subjectSlug ?? "";
    const moduleId = params?.moduleSlug ?? "";

    const mod: ReviewModule | null = useMemo(() => {
        if (!subjectSlug || !moduleId) return null;
        return getReviewModule(subjectSlug, moduleId);
    }, [subjectSlug, moduleId, ]);

    const [nav, setNav] = useState<NavInfo | null | undefined>(undefined);
    const [moduleComplete, setModuleComplete] = useState(false);
    const [subjectFinish, setSubjectFinish] = useState<SubjectFinishState | null>(null);

    const navLoading = nav === undefined;

    useEffect(() => {
        if (!subjectSlug || !moduleId) return;

        setNav(undefined);

        fetch(
            `/api/review/module-nav?subjectSlug=${encodeURIComponent(subjectSlug)}&moduleId=${encodeURIComponent(moduleId)}`,
            { cache: "no-store" },
        )
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setNav(d ?? null))
            .catch(() => setNav(null));
    }, [subjectSlug, moduleId]);

    useEffect(() => {
        let cancelled = false;

        async function loadFinish() {
            try {
                const res = await fetch(
                    `/api/review/subject-finish?subjectSlug=${encodeURIComponent(subjectSlug)}&moduleSlug=${encodeURIComponent(moduleId)}`,
                    { cache: "no-store" },
                );
                if (!res.ok) return;
                const data = (await res.json()) as SubjectFinishState;
                if (!cancelled) setSubjectFinish(data);
            } catch {
                if (!cancelled) setSubjectFinish(null);
            }
        }

        if (!subjectSlug || !moduleId) return;

        loadFinish();

        return () => {
            cancelled = true;
        };
    }, [subjectSlug, moduleId, moduleComplete]);

    useEffect(() => {
        setModuleComplete(false);
    }, [subjectSlug, moduleId, locale]);

    const footerRef = useRef<HTMLDivElement | null>(null);
    const [footerH, setFooterH] = useState(0);

    useLayoutEffect(() => {
        const el = footerRef.current;
        if (!el) return;

        const measure = () => setFooterH(Math.ceil(el.getBoundingClientRect().height));
        measure();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", measure);
            return () => window.removeEventListener("resize", measure);
        }

        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        return () => ro.disconnect();
    }, [navLoading]);

    const currentModuleHref =
        subjectSlug && moduleId
            ? `${ROUTES.moduleIntro(
                encodeURIComponent(subjectSlug),
                encodeURIComponent(moduleId),
            )}`
            : `/${encodeURIComponent(locale)}`;

    const nextModuleHref =
        nav?.nextModuleId && subjectSlug
            ? `/${ROUTES.moduleIntro(
                encodeURIComponent(subjectSlug),
                encodeURIComponent(nav.nextModuleId),
            )}`
            : currentModuleHref;

    const billingHref = buildBillingHref({
        locale,
        next: nextModuleHref,
        back: currentModuleHref,
        reason: "module",
        subject: subjectSlug || undefined,
        module: nav?.nextModuleId ?? undefined,
    });

    const showCertificateCta = Boolean(
        subjectFinish?.atEndOfPublishedTrack &&
        (subjectFinish.status === "certificate_ready" ||
            subjectFinish.status === "certificate_issued"),
    );

    const canGetCertificate = Boolean(
        subjectFinish?.certificateEligible || subjectFinish?.certificateIssued,
    );

    const certificateLabel = subjectFinish?.certificateIssued
        ? "View certificate"
        : "Get certificate";

    const certificateHint =
        subjectFinish?.status === "more_coming"
            ? subjectFinish.message
            : !canGetCertificate && showCertificateCta
                ? "Complete the remaining requirements to unlock your certificate."
                : null;

    if (!mod) {
        return (
            <div className="min-h-screen p-6 bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-white/90">
                <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-lg font-black">Review module not found</div>
                    <div className="mt-2 text-sm text-white/70">
                        Subject <code className="text-white/90">{subjectSlug}</code>, module{" "}
                        <code className="text-white/90">{moduleId}</code> is not registered.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0">
                <ReviewModuleView
                    key={`${locale}:${subjectSlug}:${moduleId}`}
                    mod={mod}
                    canUnlockAll={canUnlockAll}
                    onModuleCompleteChange={setModuleComplete}
                    footerInsetPx={footerH}
                    navigationMode={{ cards: "slideshow", quiz: "slideshow" }}
                />
            </div>

            <ReviewModuleNavBar
                ref={footerRef}
                locale={locale}
                subjectSlug={subjectSlug}
                prevModuleId={nav?.prevModuleId ?? null}
                nextModuleId={nav?.nextModuleId ?? null}
                nextLocked={Boolean(nav?.nextLocked)}
                nextBillingHref={billingHref}
                canGoNext={canUnlockAll ? true : moduleComplete}
                showCertificateCta={showCertificateCta}
                canGetCertificate={canGetCertificate}
                certificateLabel={certificateLabel}
                certificateHint={certificateHint}
            />
        </div>
    );
}