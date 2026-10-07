// src/components/practice/shell/SummaryViewSkeleton.tsx
"use client";

import React from "react";

function ShimmerLine({ w = "w-full", h = "h-3" }: { w?: string; h?: string }) {
    return (
        <div
            className={[
                "relative overflow-hidden rounded-lg",
                "ui-border ui-surface-2 border",
                h,
                w,
            ].join(" ")}
        >
            <div className="absolute inset-0 -translate-x-full animate-[ui-shimmer_1.25s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent dark:via-white/10" />
        </div>
    );
}

function ShimmerPill({ w = "w-20" }: { w?: string }) {
    return <ShimmerLine w={w} h="h-6" />;
}

function Card({ children }: { children: React.ReactNode }) {
    return <div className="ui-card overflow-hidden rounded-2xl border ui-border ui-surface">{children}</div>;
}

export default function SummaryViewSkeleton() {
    return (
        <div className="min-h-screen ui-bg ui-text">
            <div className="ui-container py-4 md:py-6">
                <div className="grid gap-4">
                    <Card>
                        <div className="border-b ui-border ui-surface-2 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <ShimmerLine w="w-44" h="h-4" />
                                    <div className="mt-2">
                                        <ShimmerLine w="w-72 max-w-full" h="h-3" />
                                    </div>
                                </div>
                                <ShimmerPill w="w-16" />
                            </div>
                        </div>

                        <div className="p-5">
                            <div className="rounded-2xl border ui-border ui-bg-accent-soft p-4">
                                <ShimmerLine w="w-28" h="h-3" />
                                <div className="mt-2">
                                    <ShimmerLine w="w-64 max-w-full" h="h-4" />
                                </div>
                            </div>

                            <div className="mt-3">
                                <ShimmerLine w="w-56 max-w-full" h="h-3" />
                            </div>
                        </div>
                    </Card>

                    <div className="flex gap-2">
                        <button className="ui-btn ui-btn-secondary ui-btn-disabled px-3 py-2 text-xs font-extrabold">
                            <span className="opacity-0">Return</span>
                        </button>
                        <button className="ui-btn ui-btn-secondary ui-btn-disabled px-3 py-2 text-xs font-extrabold">
                            <span className="opacity-0">Back</span>
                        </button>
                    </div>

                    <Card>
                        <div className="border-b ui-border ui-surface-2 p-4 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <ShimmerLine w="w-44" h="h-4" />
                                <div className="mt-2">
                                    <ShimmerLine w="w-64 max-w-full" h="h-3" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button className="ui-btn ui-btn-secondary ui-btn-disabled px-3 py-2 text-xs font-extrabold">
                                    <span className="opacity-0">Toggle</span>
                                </button>
                                <button className="ui-btn ui-btn-secondary ui-btn-disabled px-3 py-2 text-xs font-extrabold">
                                    <span className="opacity-0">Back</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-3 p-4">
                            <ReviewCardSkeleton />
                            <ReviewCardSkeleton />
                            <ReviewCardSkeleton />
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function ReviewCardSkeleton() {
    return (
        <div className="rounded-2xl border ui-border ui-surface-2 p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <ShimmerLine w="w-40" h="h-3" />
                    <div className="mt-2">
                        <ShimmerLine w="w-64 max-w-full" h="h-3" />
                    </div>
                </div>
                <ShimmerPill w="w-20" />
            </div>

            <div className="mt-3 space-y-2">
                <ShimmerLine w="w-full" h="h-3" />
                <ShimmerLine w="w-11/12" h="h-3" />
                <ShimmerLine w="w-9/12" h="h-3" />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
                <ShimmerLine w="w-28" h="h-3" />
                <ShimmerLine w="w-24" h="h-3" />
            </div>
        </div>
    );
}