"use client";

import React from "react";
import { cn } from "@/lib/cn";

/** precompute */
const FILE_ROWS = [0, 1, 2, 3, 4, 5, 6] as const;
const MOBILE_CHIPS = [0, 1, 2, 3, 4] as const;
const TAB_ROWS = [0, 1, 2] as const;

const Skel = React.memo(function Skel({ className }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={cn(
                "ui-skel rounded-md motion-reduce:animate-none",
                "max-w-full",
                className,
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
                "min-w-0 max-w-full overflow-hidden",
                className,
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
                "h-2 w-full lg:h-full lg:w-2",
                className,
            )}
        />
    );
});

function MobileTopStripSkeleton() {
    return (
        <div className="border-b border-neutral-200 bg-white/95 px-2 py-2 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95 lg:hidden">
            <div className="mb-2 flex items-center justify-between gap-2">
                <Skel className="h-3 w-10" />
                <Skel className="h-3 w-20 opacity-70" />
            </div>

            <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                    {MOBILE_CHIPS.map((i) => (
                        <Skel
                            key={i}
                            className={cn(
                                "h-9 rounded-xl",
                                i === 0 ? "w-20" : i === 1 ? "w-16" : i === 2 ? "w-24" : i === 3 ? "w-14" : "w-18",
                            )}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function ShellHeaderSkeleton() {
    return (
        <div className="border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95">
            <div className="flex items-center gap-2 px-3 py-2">
                <Skel className="h-10 w-10 rounded-lg sm:w-20" />
                <div className="min-w-0 flex-1">
                    <Skel className="h-4 w-36 max-w-[60vw]" />
                    <Skel className="mt-1 h-3 w-48 max-w-[72vw] opacity-70" />
                </div>
            </div>

            <div className="border-t border-neutral-200 px-2 py-2 dark:border-white/10">
                <div className="flex items-center gap-2 overflow-hidden">
                    <Skel className="h-9 w-20 rounded-xl" />
                    <Skel className="h-9 w-16 rounded-xl" />
                    <Skel className="h-9 w-24 rounded-xl" />
                    <Skel className="h-9 w-14 rounded-xl" />
                </div>
            </div>
        </div>
    );
}

function ExplorerSkeleton() {
    return (
        <div className="flex h-full min-h-0 flex-col bg-neutral-50/70 dark:bg-black/20">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-3 dark:border-white/10">
                <Skel className="h-3 w-24" />
                <Skel className="h-3 w-28 opacity-70" />
            </div>

            <div className="border-b border-neutral-200 p-3 dark:border-white/10">
                <Skel className="h-10 w-full rounded-lg" />
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-3 py-3">
                {FILE_ROWS.map((i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-neutral-200/60 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <Skel className="h-7 w-7 rounded-lg" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <Skel
                                    className={cn(
                                        "h-3",
                                        i % 3 === 0 ? "w-28" : i % 3 === 1 ? "w-36" : "w-24",
                                    )}
                                />
                                <Skel className={cn("h-3 opacity-70", i % 2 === 0 ? "w-16" : "w-20")} />
                            </div>
                            <Skel className="h-7 w-7 rounded-lg" />
                        </div>
                    </div>
                ))}
            </div>

            <div className="border-t border-neutral-200 p-3 dark:border-white/10">
                <Skel className="h-3 w-20" />
                <Skel className="mt-2 h-24 w-full rounded-xl" />
            </div>
        </div>
    );
}

function RunnerSkeleton() {
    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden p-2 sm:p-3">
            <Panel className="mb-2 sm:mb-3">
                <div className="overflow-hidden px-2 py-2">
                    <div className="flex items-center gap-2">
                        {TAB_ROWS.map((i) => (
                            <Skel
                                key={i}
                                className={cn(
                                    "h-8 rounded-lg",
                                    i === 0 ? "w-28" : i === 1 ? "w-24" : "w-20",
                                )}
                            />
                        ))}
                    </div>
                </div>
            </Panel>

            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <Panel className="h-full">
                    <div className="flex h-full min-h-0 flex-col">
                        {/* runner header */}
                        <div className="border-b border-neutral-200 p-3 dark:border-white/10">
                            <div className="flex items-center gap-2">
                                <div className="min-w-0 flex-1">
                                    <Skel className="h-4 w-40 max-w-[55vw]" />
                                </div>
                                <Skel className="h-10 w-10 rounded-lg" />
                                <Skel className="h-10 w-20 rounded-lg" />
                            </div>

                            <div className="mt-2 flex items-center gap-2 overflow-hidden">
                                <Skel className="h-9 w-20 rounded-lg" />
                                <Skel className="h-9 w-20 rounded-lg" />
                                <Skel className="h-9 w-16 rounded-lg" />
                            </div>
                        </div>

                        {/* mobile editor/output tabs */}
                        <div className="border-b border-neutral-200 p-2 dark:border-white/10 md:hidden">
                            <div className="grid grid-cols-2 gap-2">
                                <Skel className="h-10 w-full rounded-lg" />
                                <Skel className="h-10 w-full rounded-lg" />
                            </div>
                        </div>

                        {/* editor body */}
                        <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
                            <div className="grid h-full min-h-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
                                <div className="min-h-[260px] rounded-xl border border-neutral-200/60 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                                    <div className="space-y-3">
                                        <Skel className="h-4 w-[45%] max-w-[14rem]" />
                                        <Skel className="h-4 w-[72%] max-w-[20rem]" />
                                        <Skel className="h-4 w-[58%] max-w-[18rem]" />
                                        <Skel className="h-4 w-[80%] max-w-[22rem]" />
                                        <Skel className="h-4 w-[52%] max-w-[16rem]" />
                                        <Skel className="h-4 w-[68%] max-w-[19rem]" />
                                        <Skel className="h-4 w-[40%] max-w-[12rem]" />
                                        <Skel className="h-4 w-[75%] max-w-[21rem]" />
                                    </div>
                                </div>

                                <div className="hidden min-h-[260px] rounded-xl border border-neutral-200/60 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03] md:block">
                                    <Skel className="h-4 w-24" />
                                    <Skel className="mt-3 h-3 w-[82%] opacity-80" />
                                    <Skel className="mt-2 h-3 w-[66%] opacity-70" />
                                    <Skel className="mt-6 h-10 w-full rounded-xl" />
                                    <Skel className="mt-2 h-10 w-[72%] rounded-xl" />
                                    <Skel className="mt-2 h-10 w-[56%] rounded-xl" />
                                </div>
                            </div>
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
    );
}

export default function ProgrammingSandboxSkeleton() {
    return (
        <div className="h-dvh w-full pointer-events-none select-none overflow-hidden bg-transparent">
            <div className="grid h-full min-h-0 w-full grid-rows-[auto_1fr]">
                <MobileTopStripSkeleton />

                <div className="min-h-0 min-w-0 lg:flex">
                    <aside className="hidden h-full min-h-0 w-[220px] shrink-0 overflow-hidden border-r border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950 lg:block">
                        <ExplorerSkeleton />
                    </aside>

                    <Divider className="hidden lg:block" />

                    <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                        <div className="flex h-[100vh] min-h-0 w-full flex-col overflow-hidden rounded-none border border-neutral-200 bg-white sm:rounded-xl dark:border-white/10 dark:bg-white/[0.04]">
                            <ShellHeaderSkeleton />
                            <div className="min-h-0 flex-1">
                                <RunnerSkeleton />
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}