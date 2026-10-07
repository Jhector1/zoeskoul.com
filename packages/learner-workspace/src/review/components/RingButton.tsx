"use client";

import React, { useEffect, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { Loader2 } from "lucide-react";
import ProgressRing from "@zoeskoul/learner-ui/components/ProgressRing";

export type ReviewRingButtonProps = {
    disabled?: boolean;
    onClick?: () => void | Promise<void>;
    href?: string;
    prefetch?: boolean;
    pct: number;
    missedPct?: number;
    label: string;
    sublabel?: string;
};

export type ReviewRingButtonNavigationProps = {
    navigationKey: string;
    navigate: (href: string) => void;
    prefetchHref?: (href: string) => void;
};

type SharedRingButtonProps =
    ReviewRingButtonProps &
    ReviewRingButtonNavigationProps;

export default function RingButton({
    navigationKey,
    navigate,
    prefetchHref,
    ...props
}: SharedRingButtonProps) {
    const [clicked, setClicked] = useState(false);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setClicked(false);
    }, [navigationKey]);

    useEffect(() => {
        if (props.prefetch && props.href && prefetchHref) {
            prefetchHref(props.href);
        }
    }, [prefetchHref, props.href, props.prefetch]);

    const loading = clicked || isPending;
    const disabled = Boolean(props.disabled || loading);
    const green = Math.max(0, Math.min(1, props.pct ?? 0));

    async function handleClick() {
        if (disabled) return;

        flushSync(() => {
            setClicked(true);
        });

        try {
            await props.onClick?.();

            if (props.href) {
                startTransition(() => {
                    navigate(props.href!);
                });
            }
        } catch (error) {
            setClicked(false);
            throw error;
        }
    }

    return (
        <button
            type="button"
            disabled={disabled}
            aria-busy={loading}
            onClick={handleClick}
            className="ui-ring-button"
        >
            <div className="flex items-center justify-between gap-3">
                <ProgressRing
                    pct={green}
                    missedPct={props.missedPct}
                    loading={loading}
                >
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <span className="ui-ring-meter-value">
                            {Math.round(green * 100)}%
                        </span>
                    )}
                </ProgressRing>

                <span className="min-w-0 text-left">
                    <div className="ui-ring-button-title">{props.label}</div>
                    {props.sublabel ? (
                        <div className="ui-ring-button-subtitle">
                            {props.sublabel}
                        </div>
                    ) : null}
                </span>
            </div>
        </button>
    );
}
