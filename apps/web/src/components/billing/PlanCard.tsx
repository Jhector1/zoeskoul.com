"use client";

import React from "react";
import { cn } from "@/lib/cn";

export default function PlanCard(props: {
    title: string;
    price: string;
    subtitle: string;
    features: string[];

    recommended?: boolean;
    savings?: string;

    highlight?: boolean;

    // ✅ new: allow i18n for small labels
    priceKicker?: string;        // default "Price"
    recommendedLabel?: string;   // default "Recommended"

    ctaLabel: string;
    ctaDisabled?: boolean;
    onCta: () => void;

    trialLabel: string;
    trialDisabled?: boolean;
    onTrial: () => void;
    trialNote?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-3xl border p-5",
                "border-neutral-200/70 bg-white/70 shadow-sm",
                "dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none",
                props.recommended ? "ring-1 ring-emerald-400/20" : "",
                props.highlight ? "ring-1 ring-emerald-400/30" : "",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-black text-neutral-900 dark:text-white/90">{props.title}</div>
                    <div className="mt-1 text-xs text-neutral-500 dark:text-white/60">{props.subtitle}</div>
                </div>

                <div className="flex flex-col items-end gap-1">
                    {props.recommended ? (
                        <span className="rounded-full border border-emerald-300/40 bg-emerald-300/15 px-2 py-1 text-[11px] font-extrabold text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100">
              {props.recommendedLabel ?? "Recommended"}
            </span>
                    ) : null}

                    {props.savings ? (
                        <span className="rounded-full border border-neutral-200/70 bg-white/60 px-2 py-1 text-[11px] font-extrabold text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
              {props.savings}
            </span>
                    ) : null}
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-200/70 bg-neutral-50/80 p-4 dark:border-white/10 dark:bg-black/20">
                <div className="text-[11px] font-extrabold text-neutral-500 dark:text-white/60">
                    {props.priceKicker ?? "Price"}
                </div>
                <div className="mt-1 text-2xl font-black tracking-tight text-neutral-950 dark:text-white">
                    {props.price}
                </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm">
                {props.features.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                        <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-emerald-500/80 dark:bg-emerald-300/90" />
                        <span className="text-neutral-700 dark:text-white/80">{f}</span>
                    </div>
                ))}
            </div>

            <div className="mt-5 grid gap-2">
                <button
                    onClick={props.onCta}
                    disabled={props.ctaDisabled}
                    className={cn(
                        "rounded-2xl border px-4 py-2 text-sm font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed",
                        "border-emerald-300/50 bg-emerald-400 text-neutral-950 hover:bg-emerald-300",
                        "dark:border-emerald-300/30 dark:bg-emerald-300/15 dark:text-white/90 dark:hover:bg-emerald-300/20",
                    )}
                >
                    {props.ctaLabel}
                </button>

                <button
                    onClick={props.onTrial}
                    disabled={props.trialDisabled}
                    className={cn(
                        "rounded-2xl border px-4 py-2 text-sm font-extrabold transition disabled:opacity-50 disabled:cursor-not-allowed",
                        "border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900",
                        "dark:border-white/10 dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/15",
                    )}
                >
                    {props.trialLabel}
                </button>

                {props.trialNote ? (
                    <div className="text-[11px] text-neutral-500 dark:text-white/55">
                        {props.trialNote}
                    </div>
                ) : null}
            </div>
        </div>
    );
}