"use client";

import React from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import { cn, SKETCH_PANEL } from "./sketchUi";
import { toneCls } from "./tones";
import type { SketchTone } from "../subjects/types";

export function SketchShell({
  title,
  subtitle,
  tone,
  left,
  rightMarkdown,
  footer,
}: {
  title?: string;
  subtitle?: string;
  tone?: SketchTone;
  height?: number; // keep prop for compatibility, but we don't force layout with it
  left: React.ReactNode;
  rightMarkdown?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <div className={cn("grid gap-3", rightMarkdown ? "md:grid-cols-[1fr_320px]" : "grid-cols-1")}>
        <div className={cn(SKETCH_PANEL, toneCls(tone))}>
          {(title || subtitle) ? (
            <div className="mb-3">
              {/*{title ? <div className="text-lg font-black text-neutral-900 dark:text-white">{title}</div> : null}*/}
              {subtitle ? <div className="mt-1 text-sm text-neutral-600 dark:text-white/60">{subtitle}</div> : null}
            </div>
          ) : null}

          <div className="min-w-0">{left}</div>

          {footer ? (
            <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-white/10">
              {footer}
            </div>
          ) : null}
        </div>

        {rightMarkdown ? (
          <div className={cn(SKETCH_PANEL)}>
            <MathMarkdown
              className={cn(
                "text-sm leading-6",
                "text-neutral-700 dark:text-white/80",
                "[&_.katex]:text-neutral-900 dark:[&_.katex]:text-white/90",
                "[&_strong]:text-neutral-900 dark:[&_strong]:text-white",
                "[&_li]:my-1",
              )}
              content={rightMarkdown}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
