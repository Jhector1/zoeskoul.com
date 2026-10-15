"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useAppPreferences } from "@zoeskoul/preferences/react";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function ThemeToggle({
                                compact = false,
                                className,
                            }: {
    compact?: boolean;
    className?: string;
}) {
    const { theme, setTheme } = useTheme();
    const { updatePreferences } = useAppPreferences();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => setMounted(true), []);
    if (!mounted) return null;

    const isDark = theme === "dark";

    return (
        <button
            type="button"
            onClick={() => {
                const nextTheme = isDark ? "light" : "dark";
                setTheme(nextTheme);
                void updatePreferences({ theme: nextTheme }).catch(() => undefined);
            }}
            className={cn(
                "ui-btn-ide-border gap-1.5",
                compact ? "min-w-[72px]" : "h-9 px-3 text-xs",
                className,
            )}
            aria-label="Toggle theme"
            aria-pressed={isDark}
        >
      <span aria-hidden className="text-[13px]">
        {isDark ? "🌙" : "☀️"}
      </span>
            <span>{isDark ? "Dark" : "Light"}</span>
        </button>
    );
}
