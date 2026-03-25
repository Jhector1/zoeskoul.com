"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { BillingSkel as Skel } from "./BillingSkel";

const FEATURE_ROWS = [0, 1, 2, 3] as const;

export default function PlanCardSkeleton({
                                             recommended = false,
                                             highlight = false,
                                             withSavings = true,
                                         }: {
    recommended?: boolean;
    highlight?: boolean;
    withSavings?: boolean;
}) {
    return (
        <div
            className={cn(
                "rounded-3xl border p-5",
                "border-neutral-200/70 bg-white/70 shadow-sm",
                "dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none",
                recommended ? "ring-1 ring-emerald-400/20" : "",
                highlight ? "ring-1 ring-emerald-400/30" : ""
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <Skel className="h-4 w-24" />
                    <Skel className="mt-2 h-3.5 w-40 opacity-80" />
                </div>

                <div className="flex flex-col items-end gap-1">
                    {recommended ? <Skel className="h-6 w-28 rounded-full" /> : null}
                    {withSavings ? <Skel className="h-6 w-16 rounded-full" /> : null}
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-200/70 bg-neutral-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                <Skel className="h-3.5 w-12 opacity-80" />
                <Skel className="mt-2 h-8 w-28" />
            </div>

            <div className="mt-4 grid gap-2 text-sm">
                {FEATURE_ROWS.map((i) => (
                    <div key={i} className="flex items-start gap-2">
                        <Skel className="mt-[6px] h-1.5 w-1.5 rounded-full shrink-0" />
                        <Skel
                            className={cn(
                                "h-3.5",
                                i % 2 === 0 ? "w-[88%]" : "w-[76%]"
                            )}
                        />
                    </div>
                ))}
            </div>

            <div className="mt-5 grid gap-2">
                <Skel className="h-10 w-full rounded-2xl" />
                <Skel className="h-10 w-full rounded-2xl" />
                <Skel className="h-3 w-[78%] opacity-70" />
            </div>
        </div>
    );
}