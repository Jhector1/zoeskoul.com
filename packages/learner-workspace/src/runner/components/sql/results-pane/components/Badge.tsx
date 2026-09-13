
import React from "react";
import { cn } from "../SqlResultsPane.constants";

export function Badge(props: {
    children: React.ReactNode;
    tone?: "neutral" | "good" | "warn" | "bad";
}) {
    const { children, tone = "neutral" } = props;

    return (
        <span
            className={cn(
                "inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-medium",
                tone === "neutral" &&
                "border-neutral-200 bg-white text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65",
                tone === "good" &&
                "border-emerald-300/20 bg-emerald-300/10 text-emerald-800 dark:text-emerald-200",
                tone === "warn" &&
                "border-amber-300/20 bg-amber-300/10 text-amber-800 dark:text-amber-200",
                tone === "bad" &&
                "border-rose-300/20 bg-rose-300/10 text-rose-800 dark:text-rose-200",
            )}
        >
      {children}
    </span>
    );
}
