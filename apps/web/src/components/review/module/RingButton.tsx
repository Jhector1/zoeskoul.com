// src/components/review/module/RingButton.tsx
"use client";

import React from "react";

export default function RingButton(props: {
    disabled?: boolean;
    onClick?: () => void;

    /** Green portion (correct). 0..1 */
    pct: number;

    /** Red portion (missed/wrong). 0..1 (optional) */
    missedPct?: number;

    label: string;
    sublabel?: string;
}) {
    const green = Math.max(0, Math.min(1, props.pct ?? 0));
    const redRaw = Math.max(0, Math.min(1, props.missedPct ?? 0));

    // Ensure green + red never exceeds 1
    const red = Math.max(0, Math.min(1 - green, redRaw));

    const greenDeg = green * 360;
    const redDeg = red * 360;
    const cut1 = greenDeg;
    const cut2 = greenDeg + redDeg;

    return (
        <button
            type="button"
            disabled={props.disabled}
            onClick={props.onClick}
            className={[
                // theme-aware surface
                "mt-4 w-full rounded-xl border px-3 py-2",
                "border-neutral-200 bg-white hover:bg-neutral-50",
                "dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15",
                // text
                "text-xs font-extrabold text-neutral-900 dark:text-white/90",
                // behavior
                "text-center transition disabled:opacity-50 disabled:cursor-not-allowed",
            ].join(" ")}
        >
            <div className="flex items-center justify-between gap-3">
        <span
            className={[
                "relative inline-flex h-9 w-9 items-center justify-center rounded-full",
                // theme-aware track color via CSS var
                "[--ring-track:rgba(0,0,0,0.10)] dark:[--ring-track:rgba(255,255,255,0.12)]",
            ].join(" ")}
            style={{
                // Start the ring at the RIGHT side (so green begins on the right)
                background: `conic-gradient(from 90deg,
              rgba(16,185,129,0.92) 0deg ${cut1}deg,
              rgba(244,63,94,0.88) ${cut1}deg ${cut2}deg,
              var(--ring-track) ${cut2}deg 360deg
            )`,
            }}
        >
          <span className="inline-grid h-7 w-7 place-items-center rounded-full border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.06]">
            <span className="tabular-nums text-[7px] leading-none text-neutral-900 dark:text-white">
              {Math.round(green * 100)}%
            </span>
          </span>
        </span>

                <span className="min-w-0 text-left">
          <div className="truncate">{props.label}</div>
                    {props.sublabel ? (
                        <div className="truncate text-[11px] font-black text-neutral-600 dark:text-white/60">
                            {props.sublabel}
                        </div>
                    ) : null}
        </span>
            </div>
        </button>
    );
}