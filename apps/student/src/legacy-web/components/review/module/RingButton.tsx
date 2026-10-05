"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import { Loader2 } from "lucide-react";
import ProgressRing from "@zoeskoul/learner-ui/components/ProgressRing";

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
                <ProgressRing
                    pct={green}
                    missedPct={props.missedPct}
                    loading={loading}
                >
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <span className="ui-ring-meter-value">{Math.round(green * 100)}%</span>
                    )}
                </ProgressRing>

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