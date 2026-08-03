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
  height?: number;
  left: React.ReactNode;
  rightMarkdown?: string;
  footer?: React.ReactNode;
}) {
  return (
      <div className="w-full ui-surface-muted border-none rounded-none">
        <div className={cn("grid gap-3", rightMarkdown ? "md:grid-cols-[1fr_320px]" : "grid-cols-1")}>
          <div className={cn(SKETCH_PANEL, toneCls(tone))}>
            {title || subtitle ? (
                <div className="mb-3">
                  {title ? <div className="ui-title-sm">{title}</div> : null}
                  {subtitle ? <div className="mt-1 ui-meta">{subtitle}</div> : null}
                </div>
            ) : null}

            <div className="min-w-0">{left}</div>

            {footer ? (
                <div className="mt-4 border-t pt-3 ui-border">
                  {footer}
                </div>
            ) : null}
          </div>

          {rightMarkdown ? (
              <div className={SKETCH_PANEL}>
                <MathMarkdown
                    className={cn(
                        "text-sm leading-6 ui-text-muted",
                        "[&_.katex]:text-[rgb(var(--ui-text)/0.96)]",
                        "[&_strong]:text-[rgb(var(--ui-text)/0.96)]",
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