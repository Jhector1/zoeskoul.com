"use client";

import React, { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import NavButton from "@/components/ui/NavButton";

export default function CourseContentUpdateBanner({
                                                      show,
                                                  }: {
    show: boolean;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const currentHref = useMemo(() => {
        const qs = searchParams?.toString();
        return qs ? `${pathname}?${qs}` : pathname;
    }, [pathname, searchParams]);

    if (!show) return null;

    return (
        <div
            className="
                fixed inset-x-0 top-0 z-[9999]
                border-b px-4 py-3
                shadow-[var(--ui-shadow-lg)]
                backdrop-blur-xl
            "
            style={{
                background:
                    "linear-gradient(90deg, rgb(var(--ui-warn) / 0.24), rgb(var(--ui-surface) / 0.98) 34%, rgb(var(--ui-surface) / 0.98))",
                borderColor: "rgb(var(--ui-warn) / 0.45)",
                color: "rgb(var(--ui-text) / 1)",
            }}
            role="status"
            aria-live="polite"
        >
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div
                        className="
                            grid h-10 w-10 shrink-0 place-items-center rounded-xl border
                            text-lg shadow-[var(--ui-shadow-soft)]
                        "
                        style={{
                            backgroundColor: "rgb(var(--ui-warn) / 0.16)",
                            borderColor: "rgb(var(--ui-warn) / 0.38)",
                            color: "rgb(var(--ui-warn) / 1)",
                        }}
                        aria-hidden="true"
                    >
                        ↻
                    </div>

                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold tracking-tight">
                                Course content was updated
                            </p>

                            <span
                                className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                                style={{
                                    backgroundColor: "rgb(var(--ui-warn) / 0.12)",
                                    borderColor: "rgb(var(--ui-warn) / 0.30)",
                                    color: "rgb(var(--ui-warn) / 1)",
                                }}
                            >
                                Refresh needed
                            </span>
                        </div>

                        <p
                            className="mt-0.5 text-xs font-medium"
                            style={{
                                color: "rgb(var(--ui-text-muted) / 0.96)",
                            }}
                        >
                            Refresh to load the latest lesson and exercise edits.
                            Your saved progress will stay.
                        </p>
                    </div>
                </div>

                <NavButton
                    href={currentHref}
                    hardReloadCurrent
                    loadingText="Refreshing..."
                    showSpinner
                    className="
        shrink-0 rounded-xl border px-4 py-2
        text-sm font-bold
        transition-transform duration-150
        hover:-translate-y-0.5
        focus:outline-none
    "
                    style={{
                        backgroundColor: "rgb(var(--ui-warn) / 1)",
                        borderColor: "rgb(var(--ui-warn) / 0.55)",
                        color: "rgb(var(--ui-text-invert) / 1)",
                        boxShadow: "0 0 0 4px rgb(var(--ui-warn) / 0.18)",
                    }}
                >
                    Refresh now
                </NavButton>
            </div>
        </div>
    );
}