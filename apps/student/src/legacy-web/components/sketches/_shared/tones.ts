import type { SketchTone } from "../subjects/types";

export function toneCls(tone: SketchTone | undefined) {
    const t = tone ?? "neutral";
    if (t === "good") return "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10";
    if (t === "info") return "border-sky-600/20 bg-sky-500/10 dark:border-sky-300/25 dark:bg-sky-300/10";
    if (t === "warn") return "border-amber-600/20 bg-amber-500/10 dark:border-amber-300/25 dark:bg-amber-300/10";
    if (t === "danger") return "border-rose-600/20 bg-rose-500/10 dark:border-rose-300/25 dark:bg-rose-300/10";
    return "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]";
}
