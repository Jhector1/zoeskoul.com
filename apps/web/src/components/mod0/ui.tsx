"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export function killEvent(e: any) {
    e.stopPropagation?.();
    e.nativeEvent?.stopImmediatePropagation?.();
}

export const Toggle = React.memo(function Toggle({
                                                     label,
                                                     checked,
                                                     onChange,
                                                 }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label
            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 cursor-pointer touch-manipulation
                 dark:border-white/10 dark:bg-white/[0.06]"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onTouchStartCapture={(e) => e.stopPropagation()}
        >
      <span className="text-xs font-extrabold text-neutral-600 dark:text-white/60 pointer-events-none">
        {label}
      </span>
            <input
                type="checkbox"
                className="scale-110 cursor-pointer accent-emerald-500"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => e.stopPropagation()}
            />
        </label>
    );
});

export const KV = React.memo(function KV({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60">{label}</div>
            <div className="font-extrabold tabular-nums text-neutral-900 dark:text-white/90">{value}</div>
        </div>
    );
});

export function StatusBox({
                              kind,
                              className,
                              children,
                          }: {
    kind: "idle" | "good" | "bad";
    className?: string;
    children: React.ReactNode;
}) {
    const tone =
        kind === "good"
            ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-950 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-white/90"
            : kind === "bad"
                ? "border-rose-300/60 bg-rose-50 text-rose-950 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-white/90"
                : "border-neutral-200 bg-white/70 text-neutral-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80";

    return (
        <div className={cn("mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed", tone, className)}>
            {children}
        </div>
    );
}
