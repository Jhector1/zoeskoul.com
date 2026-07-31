"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { useSubjectFinishCopy } from "../../hooks/useSubjectFinishCopy";
import type { SubjectFinishState } from "../../types/subjectFinish.types";

export default function SubjectFinishBanner(props: {
    subjectSlug: string;
    subjectFinish: SubjectFinishState | null;
    onOpenCertificate: () => void;
}) {
    const { subjectSlug, subjectFinish, onOpenCertificate } = props;

    const copy = useSubjectFinishCopy({
        subjectSlug,
        subjectFinish,
    });

    if (!subjectFinish?.atEndOfPublishedTrack) return null;

    const showCertificateReady =
        subjectFinish.status === "certificate_ready" ||
        subjectFinish.status === "certificate_issued";

    const canGetCertificate = Boolean(
        subjectFinish.certificateEligible || subjectFinish.certificateIssued,
    );

    return (
        <div className="mt-3 border border-emerald-600/25 bg-emerald-500/10 p-3 text-xs dark:border-emerald-300/30 dark:bg-emerald-300/10">
            <div className="font-black text-emerald-900 dark:text-emerald-100">
                {copy.headline}
            </div>

            <div className="mt-1 text-emerald-900/80 dark:text-emerald-100/80">
                {subjectFinish.message ?? copy.body}
            </div>

            {showCertificateReady ? (
                <button
                    type="button"
                    className={cn(
                        "mt-3 ui-btn ui-btn-primary w-full",
                        !canGetCertificate && "opacity-60 cursor-not-allowed",
                    )}
                    disabled={!canGetCertificate}
                    onClick={onOpenCertificate}
                >
                    {copy.certificateCta}
                </button>
            ) : null}
        </div>
    );
}