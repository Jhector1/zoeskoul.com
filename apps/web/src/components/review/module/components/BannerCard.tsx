"use client";

import React from "react";
import { cn } from "@/lib/cn";

export default function BannerCard({
                                       title,
                                       body,
                                       tone = "neutral",
                                       actions,
                                   }: {
    title: string;
    body?: React.ReactNode;
    tone?: "neutral" | "good";
    actions?: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "p-4 md:p-5",
                tone === "good" ? "ui-surface-success" : "ui-surface",
            )}
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="ui-title-sm">{title}</div>

                    {body ? (
                        <div className="mt-1 text-sm text-neutral-600 dark:text-white/65">
                            {body}
                        </div>
                    ) : null}
                </div>

                {actions ? <div className="shrink-0">{actions}</div> : null}
            </div>
        </div>
    );
}