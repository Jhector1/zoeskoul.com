"use client";

import * as React from "react";

export function cn(...cls: Array<string | false | null | undefined>) {
    return cls.filter(Boolean).join(" ");
}

/* =========================================================
   Sketch shared primitives
   Keep this file aligned with the global ui-* system
========================================================= */

export const SKETCH_PANEL = cn(
    "ui-page-surface",
    "p-4 md:p-5",
);

export const SKETCH_SOFT = cn(
    "ui-surface-muted",
    "p-3",
);

export const SKETCH_LABEL = cn(
    "ui-meta-strong",
);

export const SKETCH_INPUT = cn(
    "ui-input-ide",
    "mt-1 w-full text-sm",
);

export const SKETCH_TEXTAREA = cn("ui-textarea-ide");

export const SKETCH_BTN = cn(
    "ui-btn-secondary",
);

export const SKETCH_BTN_PRIMARY = cn(
    "ui-btn-primary",
);

export function Pill({ children }: { children: React.ReactNode }) {
    return <span className="ui-pill-neutral">{children}</span>;
}

/* =========================================================
   Shared blocks
========================================================= */

export function CodeBlock({
                              title,
                              children,
                              actions,
                          }: {
    title?: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
}) {
    return (
        <div className={SKETCH_SOFT}>
            <div className="flex items-center justify-between gap-2">
                <div className={SKETCH_LABEL}>{title ?? "Output"}</div>
                {actions ? <div className="shrink-0">{actions}</div> : null}
            </div>

            <pre
                className={cn(
                    "mt-2 whitespace-pre-wrap break-words rounded-md border p-3 font-mono text-[12px] leading-5",
                    "ui-border ui-bg-surface ui-text-muted",
                )}
            >
        {children}
      </pre>
        </div>
    );
}