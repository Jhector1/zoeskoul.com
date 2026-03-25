"use client";

import React from "react";
import { cn } from "@/lib/cn";
import BillingShell from "@/components/billing/BillingShell";
import { CARD } from "@/components/billing/styles";
import BillingHeaderSkeleton from "./BillingHeaderSkeleton";
import PlanCardSkeleton from "./PlanCardSkeleton";
import InfoRowSkeleton from "./InfoRowSkeleton";
import { BillingSkel as Skel } from "./BillingSkel";

const SIDEBAR_ROWS = [0, 1, 2, 3] as const;

function PaywallSkeleton() {
    return (
        <div className="px-5 pb-5">
            <div
                className={cn(
                    "rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4 text-sm",
                    "dark:border-amber-300/15 dark:bg-amber-300/5"
                )}
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Skel className="h-5 w-44" />
                    <Skel className="h-8 w-20 rounded-xl" />
                </div>

                <Skel className="mt-3 h-3.5 w-[94%] max-w-[40rem] opacity-80" />
                <Skel className="mt-2 h-3.5 w-[82%] max-w-[30rem] opacity-70" />
                <Skel className="mt-3 h-3.5 w-[60%] max-w-[18rem] opacity-60" />
            </div>
        </div>
    );
}

function PlansSectionHeaderSkeleton() {
    return (
        <div className="border-b border-neutral-200/70 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
            <Skel className="h-4 w-28" />
            <Skel className="mt-2 h-3.5 w-56 opacity-80" />

            <div className="mt-3 flex items-center gap-2">
                <Skel className="h-8 w-14 rounded-xl" />
                <Skel className="h-8 w-14 rounded-xl" />
            </div>
        </div>
    );
}

function StripeStatusPanelSkeleton() {
    return (
        <div className="p-5 pt-4">
            <div
                className={cn(
                    "rounded-2xl border border-neutral-200/70 bg-white/70 p-4 shadow-sm",
                    "dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none"
                )}
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <Skel className="h-5 w-36" />
                        <Skel className="mt-2 h-4 w-48 opacity-80" />
                    </div>

                    <Skel className="h-6 w-24 rounded-full" />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-neutral-200/60 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <Skel className="h-3.5 w-20 opacity-80" />
                        <Skel className="mt-2 h-4 w-28" />
                    </div>

                    <div className="rounded-xl border border-neutral-200/60 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <Skel className="h-3.5 w-24 opacity-80" />
                        <Skel className="mt-2 h-4 w-32" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function SidebarHeaderSkeleton() {
    return (
        <div className="border-b border-neutral-200/70 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
            <Skel className="h-4 w-24" />
            <Skel className="mt-2 h-3.5 w-44 opacity-80" />
        </div>
    );
}

export default function BillingPageSkeleton({
                                                showPaywall = false,
                                            }: {
    showPaywall?: boolean;
}) {
    return (
        <BillingShell>
            <div className="pointer-events-none select-none relative mx-auto max-w-5xl grid gap-4">
                <div className={CARD}>
                    <BillingHeaderSkeleton />
                    {showPaywall ? <PaywallSkeleton /> : null}
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <div className={cn(CARD, "lg:col-span-2")}>
                        <PlansSectionHeaderSkeleton />
                        <StripeStatusPanelSkeleton />

                        <div className="p-5 grid gap-3 md:grid-cols-2">
                            <PlanCardSkeleton />
                            <PlanCardSkeleton recommended highlight />
                        </div>
                    </div>

                    <div className={CARD}>
                        <SidebarHeaderSkeleton />

                        <div className="p-5 grid gap-3 text-sm">
                            {SIDEBAR_ROWS.map((i) => (
                                <InfoRowSkeleton key={i} />
                            ))}

                            <div className="rounded-2xl border border-neutral-200/70 bg-white/70 p-4 text-xs text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:shadow-none">
                                <Skel className="h-3.5 w-[94%] opacity-80" />
                                <Skel className="mt-2 h-3.5 w-[78%] opacity-70" />
                            </div>
                        </div>
                    </div>
                </div>

                <Skel className="h-3.5 w-[70%] max-w-[34rem] opacity-70" />
            </div>
        </BillingShell>
    );
}