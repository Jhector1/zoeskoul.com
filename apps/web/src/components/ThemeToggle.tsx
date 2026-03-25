"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/cn";

export function ThemeToggle({
                                compact = false,
                                className,
                            }: {
    compact?: boolean;
    className?: string;
}) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => setMounted(true), []);
    if (!mounted) return null;

    const isDark = theme === "dark";

    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white shadow-sm transition",
                "focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:border-white/10 dark:bg-white/5 dark:focus:ring-white/20",
                compact ? "h-9 px-3 text-xs font-semibold" : "h-10 px-4 text-sm font-semibold",
                className
            )}
            aria-label="Toggle theme"
            aria-pressed={isDark}
        >
            <span aria-hidden>{isDark ? "🌙" : "☀️"}</span>
            <span>{isDark ? "Dark" : "Light"}</span>
        </button>
    );
}