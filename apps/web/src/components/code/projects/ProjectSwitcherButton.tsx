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
            title={title}
            className={cn(
                "inline-flex h-8 min-w-0 max-w-[240px] items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors",
                "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
                "dark:text-white/75 dark:hover:bg-white/[0.06] dark:hover:text-white/90",
                disabled && "cursor-not-allowed opacity-40",
            )}
        >
            {dirty ? (
                <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                />
            ) : (
                <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-transparent"
                />
            )}

            <span className="truncate">{title}</span>

            <span
                aria-hidden="true"
                className="shrink-0 text-[10px] text-neutral-400 dark:text-white/35"
            >
        ▾
      </span>
        </button>
    );
}