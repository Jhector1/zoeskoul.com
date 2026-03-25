import React from "react";
import { cn } from "@/lib/cn";

export default function Badge({
                                  children,
                                  tone = "neutral",
                              }: {
    children: React.ReactNode;
    tone?: "neutral" | "good" | "warn";
}) {
    const cls =
        tone === "good"
            ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-900 dark:text-emerald-100"
            : tone === "warn"
                ? "border-rose-300/40 bg-rose-300/15 text-rose-900 dark:text-rose-100"
                : "border-neutral-200/70 bg-white/70 text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80";

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold",
                cls,
            )}
        >
      {children}
    </span>
    );
}
