"use client";

import React from "react";
import { cn } from "@/components/ide/utils";

export default function ProjectSwitcherButton(props: {
    title: string;
    dirty: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    const { title, dirty, disabled = false, onClick } = props;

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "inline-flex min-w-0 max-w-[280px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-extrabold transition",
                "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50",
                "dark:border-white/10 dark:bg-white/[0.04] dark:text-white/90 dark:hover:bg-white/[0.08]",
                disabled && "cursor-not-allowed opacity-60",
            )}
            title={title}
        >
            <span className="truncate">{title}</span>

            {dirty ? (
                <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white">
          Unsaved
        </span>
            ) : null}

            <span className="shrink-0 text-xs opacity-70">▾</span>
        </button>
    );
}