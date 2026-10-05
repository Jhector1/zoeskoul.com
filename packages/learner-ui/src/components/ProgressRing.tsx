import React from "react";
import { cn } from "../lib/cn";

export type ProgressRingProps = {
  pct: number;
  missedPct?: number;
  loading?: boolean;
  size?: "sm" | "md";
  className?: string;
  coreClassName?: string;
  children: React.ReactNode;
  ariaLabel?: string;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function ProgressRing({
  pct,
  missedPct = 0,
  loading = false,
  size = "md",
  className,
  coreClassName,
  children,
  ariaLabel,
}: ProgressRingProps) {
  const progress = clamp01(pct);
  const missed = Math.min(1 - progress, clamp01(missedPct));
  const progressDeg = progress * 360;
  const missedDeg = missed * 360;
  const cut2 = progressDeg + missedDeg;

  return (
    <span
      className={cn(
        "ui-progress-ring",
        size === "sm" ? "ui-progress-ring-sm" : "ui-progress-ring-md",
        className,
      )}
      style={{
        background: loading
          ? "conic-gradient(from 90deg, rgb(var(--ui-accent) / 0.22) 0deg 360deg)"
          : `conic-gradient(
              from 90deg,
              rgb(var(--ui-accent) / 0.92) 0deg ${progressDeg}deg,
              rgb(var(--ui-danger) / 0.88) ${progressDeg}deg ${cut2}deg,
              rgb(var(--ui-border-soft) / 1) ${cut2}deg 360deg
            )`,
      }}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <span
        className={cn(
          "ui-progress-ring-core",
          size === "sm" ? "ui-progress-ring-core-sm" : "ui-progress-ring-core-md",
          coreClassName,
        )}
      >
        {children}
      </span>
    </span>
  );
}

export default ProgressRing;
