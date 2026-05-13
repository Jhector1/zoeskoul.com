"use client";

import React from "react";
import { useParams } from "next/navigation";

import type { ReviewModule } from "@/lib/subjects/types";
import ReviewModuleView from "@/components/review/module/ReviewModuleView";
import { useReviewContentUpdate } from "@/components/review/module/hooks/useReviewContentUpdate";
import CourseContentUpdateBanner from "@/components/review/module/components/CourseContentUpdateBanner";

export default function ReviewModulePageClient({
                                                   canUnlockAll,
                                                   mod,
                                               }: {
    canUnlockAll: boolean;
    mod: ReviewModule | null;
}) {
    const params = useParams<{
        locale: string;
        subjectSlug: string;
        moduleSlug: string;
    }>();

    const subjectSlug = params?.subjectSlug ?? "";
    const moduleId = params?.moduleSlug ?? "";

    const contentUpdate = useReviewContentUpdate({
        loadedContentVersion: mod?.contentVersion ?? null,
    });

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
        <>
            <CourseContentUpdateBanner show={contentUpdate.updateAvailable} />

            <div
                className={[
                    "h-screen w-screen overflow-hidden flex flex-col",
                    contentUpdate.updateAvailable ? "pt-[57px]" : "",
                ].join(" ")}
            >
                <div className="flex-1 min-h-0">
                    <ReviewModuleView
                        key={`${params?.locale ?? "en"}:${subjectSlug}:${moduleId}`}
                        mod={mod}
                        canUnlockAll={canUnlockAll}
                        navigationMode={{ cards: "slideshow", quiz: "slideshow" }}
                    />
                </div>
            </div>
        </>
    );
}