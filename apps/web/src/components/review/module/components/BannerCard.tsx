"use client";

import React from "react";
import { cn } from "@/lib/cn";

export default function BannerCard({
                                       title,
                                       body,
                                       tone = "neutral",
                                       actions,
                                   }: {
    title: string;
    body?: React.ReactNode;
    tone?: "neutral" | "good";
    actions?: React.ReactNode;
}) {
    const toneCls =
        tone === "good"
            ? "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10"
            : "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]";

    return (
        <div className={cn("rounded-2xl border p-4 md:p-5", toneCls)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="text-sm font-black text-neutral-900 dark:text-white">{title}</div>
                    {body ? <div className="mt-1 text-sm text-neutral-700 dark:text-white/70">{body}</div> : null}
                </div>
                {actions ? <div className="shrink-0">{actions}</div> : null}
            </div>
        </div>
    );
}
