"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { CARD } from "@/components/billing/styles";
import BillingShell from "@/components/billing/BillingShell";

const PLAN_FEATURES = [0, 1, 2, 3] as const;
const SIDEBAR_ROWS = [0, 1, 2, 3] as const;

const Skel = React.memo(function Skel({ className }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={cn(
                "ui-skel rounded-md motion-reduce:animate-none",
                "max-w-full",
                className
            )}
        />
    );
});

const Panel = React.memo(function Panel({
                                            className,
                                            children,
                                        }: {
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                CARD,
                "min-w-0 max-w-full overflow-hidden",
                className
            )}
        >
            {children}
        </div>
    );
});

function BillingHeaderSkeleton() {
    return (
        <div className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Skel className="h-6 w-24 rounded-full" />
                        <Skel className="h-6 w-20 rounded-full" />
                    </div>

                    <Skel className="mt-3 h-8 w-56 max-w-[75%]" />
                    <Skel className="mt-2 h-4 w-[92%] max-w-[36rem] opacity-80" />
                    <Skel className="mt-2 h-4 w-[72%] max-w-[24rem] opacity-70" />
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Skel className="h-10 w-28 rounded-xl" />
                    <Skel className="h-10 w-24 rounded-xl" />
                </div>
            </div>
        </div>
    );
}

function PaywallNoticeSkeleton() {
    return (
        <div className="px-5 pb-5">
            <div
                className={cn(
                    "rounded-2xl border p-4",
                    "border-amber-200/70 bg-amber-50/70",
                    "dark:border-amber-300/15 dark:bg-amber-300/5"
                )}
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Skel className="h-5 w-44" />
                    <Skel className="h-8 w-20 rounded-xl" />
                </div>

                <Skel className="mt-3 h-3.5 w-[92%] max-w-[42rem] opacity-80" />
                <Skel className="mt-2 h-3.5 w-[78%] max-w-[34rem] opacity-70" />
                <Skel className="mt-3 h-3.5 w-[62%] max-w-[24rem] opacity-60" />
            </div>
        </div>
    );
}

function StripeStatusSkeleton() {
    return (
        <div className="p-5 pt-4">
            <div
                className={cn(
                    "rounded-2xl border p-4",
                    "border-neutral-200/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]"
                )}
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <Skel className="h-5 w-36" />
                        <Skel className="mt-2 h-4 w-48 opacity-80" />
                    </div>

                    <Skel className="h-7 w-24 rounded-full" />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-neutral-200/60 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <Skel className="h-3.5 w-24 opacity-80" />
                        <Skel className="mt-2 h-4 w-32" />
                    </div>

                    <div className="rounded-xl border border-neutral-200/60 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                        <Skel className="h-3.5 w-28 opacity-80" />
                        <Skel className="mt-2 h-4 w-36" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function PlanCardSkeleton({ recommended = false }: { recommended?: boolean }) {
    return (
        <div
            className={cn(
                "rounded-2xl border p-4 sm:p-5",
                recommended
                    ? "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-300/15 dark:bg-emerald-300/[0.04]"
                    : "border-neutral-200/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]"
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Skel className="h-5 w-20" />
                        {recommended ? <Skel className="h-5 w-24 rounded-full" /> : null}
                    </div>

                    <Skel className="mt-3 h-9 w-28" />
                    <Skel className="mt-2 h-4 w-40 opacity-80" />
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {PLAN_FEATURES.map((i) => (
                    <div key={i} className="flex items-start gap-3">
                        <Skel className="mt-0.5 h-5 w-5 rounded-full shrink-0" />
                        <div className="min-w-0 flex-1">
                            <Skel
                                className={cn(
                                    "h-3.5",
                                    i % 2 === 0 ? "w-[88%]" : "w-[76%]"
                                )}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-5 rounded-xl border border-neutral-200/60 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <Skel className="h-3.5 w-32 opacity-80" />
                <Skel className="mt-2 h-3.5 w-[85%] opacity-70" />
            </div>

            <div className="mt-5 grid gap-2">
                <Skel className="h-11 w-full rounded-xl" />
                <Skel className="h-10 w-full rounded-xl" />
            </div>
        </div>
    );
}

function InfoRowSkeleton() {
    return (
        <div className="rounded-2xl border border-neutral-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <Skel className="h-4 w-40" />
            <Skel className="mt-2 h-3.5 w-[92%] opacity-80" />
            <Skel className="mt-2 h-3.5 w-[68%] opacity-70" />
        </div>
    );
}

export default function BillingPageSkeleton({
                                                showPaywall = true,
                                            }: {
    showPaywall?: boolean;
}) {
    return (
        <BillingShell>
            <div className="pointer-events-none select-none relative mx-auto grid max-w-5xl gap-4">
                <Panel>
                    <BillingHeaderSkeleton />
                    {showPaywall ? <PaywallNoticeSkeleton /> : null}
                </Panel>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Panel className="lg:col-span-2">
                        <div className="border-b border-neutral-200/70 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
                            <Skel className="h-5 w-36" />
                            <Skel className="mt-2 h-3.5 w-64 max-w-[85%] opacity-80" />

                            <div className="mt-4 flex items-center gap-2">
                                <Skel className="h-8 w-14 rounded-xl" />
                                <Skel className="h-8 w-14 rounded-xl" />
                            </div>
                        </div>

                        <StripeStatusSkeleton />

                        <div className="grid gap-3 p-5 md:grid-cols-2">
                            <PlanCardSkeleton />
                            <PlanCardSkeleton recommended />
                        </div>
                    </Panel>

                    <Panel>
                        <div className="border-b border-neutral-200/70 bg-white/70 p-5 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
                            <Skel className="h-5 w-28" />
                            <Skel className="mt-2 h-3.5 w-44 opacity-80" />
                        </div>

                        <div className="grid gap-3 p-5 text-sm">
                            {SIDEBAR_ROWS.map((i) => (
                                <InfoRowSkeleton key={i} />
                            ))}

                            <div className="rounded-2xl border border-neutral-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                                <Skel className="h-3.5 w-[92%] opacity-80" />
                                <Skel className="mt-2 h-3.5 w-[78%] opacity-70" />
                            </div>
                        </div>
                    </Panel>
                </div>

                <Skel className="h-3.5 w-[72%] max-w-[34rem] opacity-70" />
            </div>
        </BillingShell>
    );
}