"use client";

import React from "react";
import { cn } from "@/lib/cn";
import Badge from "./Badge";

export default function PlanCard(props: {
    title: string;
    price: string;
    subtitle: string;
    features: string[];

    recommended?: boolean;
    savings?: string;
    highlight?: boolean;

    priceKicker?: string;
    recommendedLabel?: string;

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
                "ui-page-surface p-5",
                props.recommended || props.highlight ? "ring-1 ring-emerald-500/15" : "",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="ui-title-sm">{props.title}</div>
                    <div className="mt-1 ui-meta">{props.subtitle}</div>
                </div>

                <div className="flex flex-col items-end gap-1">
                    {props.recommended ? (
                        <Badge tone="good">{props.recommendedLabel ?? "Recommended"}</Badge>
                    ) : null}

                    {props.savings ? <Badge>{props.savings}</Badge> : null}
                </div>
            </div>

            <div className="ui-surface-muted mt-4 p-4">
                <div className="ui-kicker">{props.priceKicker ?? "Price"}</div>
                <div className="mt-1 ui-title-lg">{props.price}</div>
            </div>

            <div className="mt-4 grid gap-2 text-sm">
                {props.features.map((f) => (
                    <div key={f} className="flex items-start gap-2">
            <span
                className="mt-[7px] h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "rgb(var(--ui-accent) / 0.9)" }}
            />
                        <span className="text-neutral-700 dark:text-white/80">{f}</span>
                    </div>
                ))}
            </div>

            <div className="mt-5 grid gap-2">
                <button
                    onClick={props.onCta}
                    disabled={props.ctaDisabled}
                    className={cn("ui-btn-primary w-full", "disabled:cursor-not-allowed disabled:opacity-40")}
                >
                    {props.ctaLabel}
                </button>

                <button
                    onClick={props.onTrial}
                    disabled={props.trialDisabled}
                    className={cn("ui-btn-secondary w-full", "disabled:cursor-not-allowed disabled:opacity-40")}
                >
                    {props.trialLabel}
                </button>

                {props.trialNote ? <div className="ui-meta">{props.trialNote}</div> : null}
            </div>
        </div>
    );
}