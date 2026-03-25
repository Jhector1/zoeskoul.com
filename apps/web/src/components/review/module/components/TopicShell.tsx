"use client";

import React from "react";
import { useTaggedT } from "@/i18n/tagged"; // <-- use your canonical path

export default function TopicShell(props: {
    title?: string;
    subtitle?: string | null;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    const { right, children } = props;
    const tt = useTaggedT();

    // ✅ auto-resolve "@:..." keys (literal strings unchanged)
    const title = tt.resolve(props.title ?? "");
    const subtitle = tt.resolve(props.subtitle ?? null);

    return (
        <section className="min-h-full">
            <div className="sticky isolate">
                <div className="bg-white dark:bg-neutral-950">
                    <div className="mb-3 rounded-2xl border border-neutral-200 p-3 shadow-sm dark:border-white/10">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-black tracking-tight text-neutral-900 dark:text-white/90 whitespace-normal break-words">
                                    {title}
                                </div>

                                {subtitle ? (
                                    <div className="mt-1 text-xs font-extrabold text-neutral-600 dark:text-white/60 whitespace-normal break-words">
                                        {subtitle}
                                    </div>
                                ) : null}
                            </div>

                            {right ? (
                                <div className="shrink-0 flex items-center gap-2 flex-nowrap whitespace-nowrap [&>button]:whitespace-nowrap">
                                    {right}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            <div className="relative z-0">{children}</div>
        </section>
    );
}