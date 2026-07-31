"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import { Loader2 } from "lucide-react";

export default function RingButton(props: {
    disabled?: boolean;
    onClick?: () => void | Promise<void>;
    href?: string;
    prefetch?: boolean;
    pct: number;
    missedPct?: number;
    label: string;
    sublabel?: string;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [clicked, setClicked] = useState(false);
    const [isPending, startTransition] = useTransition();

    const currentUrl = useMemo(() => {
        const qs = searchParams?.toString();
        return qs ? `${pathname}?${qs}` : pathname;
    }, [pathname, searchParams]);

    useEffect(() => {
        setClicked(false);
    }, [currentUrl]);

    useEffect(() => {
        if (props.prefetch && props.href) {
            router.prefetch(props.href);
        }
    }, [props.prefetch, props.href, router]);

    const loading = clicked || isPending;
    const disabled = Boolean(props.disabled || loading);

    const green = Math.max(0, Math.min(1, props.pct ?? 0));
    const redRaw = Math.max(0, Math.min(1, props.missedPct ?? 0));
    const red = Math.max(0, Math.min(1 - green, redRaw));

    const greenDeg = green * 360;
    const redDeg = red * 360;
    const cut1 = greenDeg;
    const cut2 = greenDeg + redDeg;

    async function handleClick() {
        if (disabled) return;

        flushSync(() => {
            setClicked(true);
        });

        try {
            await props.onClick?.();

            if (props.href) {
                startTransition(() => {
                    router.push(props.href!);
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
                <span
                    className="ui-ring-meter [--ring-track:rgb(var(--ui-border-soft)/1)]"
                    style={{
                        background: loading
                            ? "conic-gradient(from 90deg, rgb(var(--ui-accent) / 0.22) 0deg 360deg)"
                            : `conic-gradient(
                                from 90deg,
                                rgb(var(--ui-accent) / 0.92) 0deg ${cut1}deg,
                                rgb(var(--ui-danger) / 0.88) ${cut1}deg ${cut2}deg,
                                var(--ring-track) ${cut2}deg 360deg
                              )`,
                    }}
                >
                    <span className="ui-ring-meter-core">
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <span className="ui-ring-meter-value">{Math.round(green * 100)}%</span>
                        )}
                    </span>
                </span>

                <span className="min-w-0 text-left">
                    <div className="ui-ring-button-title">{props.label}</div>
                    {props.sublabel ? (
                        <div className="ui-ring-button-subtitle">{props.sublabel}</div>
                    ) : null}
                </span>
            </div>
        </button>
    );
}