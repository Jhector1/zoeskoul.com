"use client";

import * as React from "react";

export function cn(...cls: Array<string | false | null | undefined>) {
    return cls.filter(Boolean).join(" ");
}

/**
 * These map to your existing Learnoir tokens:
 * - ui-card/ui-soft/ui-btn/ui-btn-primary/etc (in your ui.css)
 * If you don't have ui-sketch-* tokens, these strings still produce consistent Tailwind.
 */
export const SKETCH_PANEL = cn(
    "rounded-2xl border p-4 md:p-5",
    "border-neutral-200 bg-white",
    "dark:border-white/10 dark:bg-white/[0.04]",
);

export const SKETCH_SOFT = cn(
    "rounded-2xl border p-3",
    "border-neutral-200 bg-neutral-50",
    "dark:border-white/10 dark:bg-black/20",
);

export const SKETCH_LABEL = cn(
    "text-[11px] font-extrabold",
    "text-neutral-600 dark:text-white/60",
);

export const SKETCH_INPUT = cn(
    "mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none",
    "border-neutral-200 bg-white text-neutral-900",
    "focus:ring-2 focus:ring-emerald-400/30",
    "dark:border-white/10 dark:bg-white/[0.05] dark:text-white/90",
);

export const SKETCH_TEXTAREA = cn(
    SKETCH_INPUT,
    "min-h-[120px] font-mono text-[12px] leading-5",
);

export const SKETCH_BTN = cn("ui-btn ui-btn-secondary", "text-xs font-extrabold");
export const SKETCH_BTN_PRIMARY = cn("ui-btn ui-btn-primary", "text-xs font-extrabold");

export function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-black text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70">
            {children}
            </span>
    );
}

export function CodeBlock({
                              title,
                              children,
                              actions,
                          }: {
    title?: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
}) {
    return (
        <div className={SKETCH_SOFT}>
        <div className="flex items-center justify-between gap-2">
        <div className={SKETCH_LABEL}>{title ?? "Output"}</div>
    {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-neutral-200 bg-white p-3 text-[12px] leading-5 text-neutral-800 dark:border-white/10 dark:bg-black/20 dark:text-white/80">
        {children}
        </pre>
        </div>
    );
    }
