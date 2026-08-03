"use client";

import React from "react";
import { cn } from "@/lib/cn";

/** ✅ precompute (no Array.from allocations every render) */
const LEFT_ROWS = [0, 1, 2, 3, 4, 5, 6] as const;
const MAIN_CARDS = [0, 1, 2, 3, 4, 5] as const;

const Skel = React.memo(function Skel({ className }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={cn(
                "ui-skel rounded-md motion-reduce:animate-none",
                // ✅ never allow skeleton blocks to create horizontal overflow
                "max-w-full",
                className
            )}
        />
    );
});

const Panel = React.memo(function Panel({
                                            className,
                                            children,
                                        }: {
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "rounded-2xl border border-neutral-200/70 bg-white/70 backdrop-blur",
                "dark:border-white/10 dark:bg-white/[0.04]",
                // ✅ contain any accidental overflow
                "min-w-0 max-w-full overflow-hidden",
                className
            )}
        >
            {children}
        </div>
    );
});

const Divider = React.memo(function Divider({ className }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={cn(
                "rounded-xl bg-neutral-200/60 dark:bg-white/5",
                "h-2 w-full md:h-full md:w-2",
                className
            )}
        />
    );
});

function HeaderBarSkeleton() {
    return (
        <div className="shrink-0">
            <Panel className="p-3">
                <div className="flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <Skel className="h-9 w-9 rounded-2xl" />
                        <div className="min-w-0">
                            <Skel className="h-4 w-32 max-w-[60vw]" />
                            <Skel className="mt-1 h-3 w-48 opacity-70 max-w-[72vw]" />
                        </div>
                    </div>

                    {/* right actions */}
                    <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
                        <Skel className="h-9 w-16 rounded-xl" />
                        <Skel className="h-9 w-10 rounded-xl" />
                    </div>
                </div>

                {/* ✅ mobile “slot row” feel (chips/buttons under header) */}
                <div className="mt-3 flex items-center gap-2 overflow-hidden md:hidden">
                    <Skel className="h-9 w-24 rounded-xl" />
                    <Skel className="h-9 w-24 rounded-xl" />
                    <Skel className="h-9 w-24 rounded-xl" />
                </div>
            </Panel>
        </div>
    );
}

export default function ReviewModuleSkeleton(props: {
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    leftW: number;
    rightW: number;
}) {
    const { leftCollapsed, rightCollapsed, leftW, rightW } = props;

    return (
        <div className="h-full w-full pointer-events-none select-none overflow-x-hidden">
            <div className="h-full w-full p-3 md:p-4">
                <div className="h-full min-h-0 flex flex-col gap-3">
                    {/* ✅ header placeholder (matches real page structure) */}
                    <HeaderBarSkeleton />

                    {/* body */}
                    <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3">
                        {/* LEFT (hidden on small; shows on md+) */}
                        <aside
                            className={cn(
                                "hidden md:block h-full min-h-0 overflow-hidden transition-[width] duration-300 ease-out",
                                leftCollapsed && "w-0"
                            )}
                            style={{ width: leftCollapsed ? 0 : leftW }}
                        >
                            <Panel className="h-full p-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Skel className="h-10 w-10 rounded-2xl" />
                                    <div className="min-w-0 flex-1 space-y-2">
                                        <Skel className="h-4 w-36 max-w-full" />
                                        <Skel className="h-3 w-24 opacity-80 max-w-full" />
                                    </div>
                                    <Skel className="h-8 w-8 rounded-xl" />
                                </div>

                                <div className="mt-4 space-y-2">
                                    <Skel className="h-2 w-full rounded-full" />
                                    <div className="flex items-center justify-between gap-3">
                                        <Skel className="h-3 w-16 opacity-80" />
                                        <Skel className="h-3 w-10 opacity-80" />
                                    </div>
                                </div>

                                <div className="mt-5 space-y-2">
                                    {LEFT_ROWS.map((i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                "rounded-xl border border-neutral-200/60 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]",
                                                i >= 5 && "hidden xl:block"
                                            )}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Skel className="h-7 w-7 rounded-lg" />
                                                <div className="min-w-0 flex-1 space-y-2">
                                                    <Skel className={cn("h-3", i % 3 === 0 ? "w-40" : i % 3 === 1 ? "w-32" : "w-44")} />
                                                    <Skel className={cn("h-3 opacity-70", i % 2 === 0 ? "w-24" : "w-20")} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-5 space-y-2">
                                    <div className="rounded-xl border border-neutral-200/60 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                                        <Skel className="h-4 w-28" />
                                        <Skel className="mt-2 h-3 w-40 opacity-70" />
                                        <Skel className="mt-3 h-10 w-full rounded-xl" />
                                    </div>

                                    <Skel className="h-10 w-full rounded-xl" />
                                    <Skel className="h-10 w-full rounded-xl" />
                                </div>
                            </Panel>
                        </aside>

                        {!leftCollapsed ? <Divider className="hidden md:block" /> : null}

                        {/* MAIN (always visible; mobile-first) */}
                        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
                            <Panel className="h-full p-4">
                                {/* topic header inside content */}
                                <div className="flex flex-col gap-3 min-w-0">
                                    <div className="min-w-0 space-y-2">
                                        {/* ✅ percentage widths to avoid overflow */}
                                        <Skel className="h-6 w-[65%] max-w-[18rem]" />
                                        <Skel className="h-4 w-[92%] max-w-[26rem] opacity-80" />
                                    </div>

                                    {/* ✅ actions row should wrap on tiny widths */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Skel className="h-9 w-20 rounded-xl" />
                                        <Skel className="h-9 w-20 rounded-xl" />
                                        <Skel className="h-9 w-10 rounded-xl" />
                                        <Skel className="h-9 w-10 rounded-xl" />
                                    </div>
                                </div>

                                {/* cards: fewer on mobile, more as screen grows */}
                                <div className="mt-4 grid gap-3">
                                    {MAIN_CARDS.map((i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                "rounded-2xl border border-neutral-200/60 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]",
                                                // ✅ show 3 on mobile
                                                i >= 3 && "hidden sm:block",
                                                // ✅ show 4 on md
                                                i >= 4 && "hidden md:block",
                                                // ✅ show 6 on lg+
                                                i >= 6 && "hidden lg:block"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3 min-w-0">
                                                <div className="min-w-0 flex-1 space-y-2">
                                                    <Skel className={cn("h-4", i % 2 === 0 ? "w-[70%] max-w-[16rem]" : "w-[78%] max-w-[18rem]")} />
                                                    <Skel className={cn("h-3 opacity-80", i % 3 === 0 ? "w-[88%] max-w-[22rem]" : "w-[82%] max-w-[20rem]")} />
                                                </div>
                                                <Skel className="h-8 w-20 rounded-xl shrink-0" />
                                            </div>

                                            <Skel
                                                className={cn(
                                                    "mt-4 w-full rounded-xl",
                                                    i % 3 === 0 ? "h-24 sm:h-28" : i % 3 === 1 ? "h-28 sm:h-36" : "h-20 sm:h-24"
                                                )}
                                            />

                                            {/* ✅ wrap buttons so they never overflow */}
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Skel className="h-9 w-24 rounded-xl" />
                                                <Skel className="h-9 w-28 rounded-xl" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Panel>
                        </main>

                        {!rightCollapsed ? <Divider className="hidden lg:block" /> : null}

                        {/* RIGHT (only on large screens) */}
                        <aside
                            className={cn(
                                "hidden lg:block h-full min-h-0 overflow-hidden transition-[width] duration-300 ease-out",
                                rightCollapsed && "w-0"
                            )}
                            style={{ width: rightCollapsed ? 0 : rightW }}
                        >
                            <Panel className="h-full p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <Skel className="h-5 w-28" />
                                    <Skel className="h-8 w-8 rounded-xl" />
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Skel className="h-8 w-20 rounded-xl" />
                                    <Skel className="h-8 w-20 rounded-xl" />
                                    <Skel className="h-8 w-20 rounded-xl hidden xl:block" />
                                </div>

                                <Skel className="mt-4 h-44 w-full rounded-2xl" />
                                <Skel className="mt-3 h-28 w-full rounded-2xl" />

                                <div className="mt-3 space-y-2">
                                    <Skel className="h-10 w-full rounded-xl" />
                                    <Skel className="h-10 w-full rounded-xl" />
                                </div>
                            </Panel>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}