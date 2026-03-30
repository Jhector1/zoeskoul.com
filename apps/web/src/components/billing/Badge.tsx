"use client";

import React from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "good" | "warn" | "danger" | "info";

export default function Badge({
                                  children,
                                  tone = "neutral",
                                  className,
                              }: {
    children: React.ReactNode;
    tone?: BadgeTone;
    className?: string;
}) {
    const cls =
        tone === "good"
            ? "ui-pill-good"
            : tone === "warn"
                ? "ui-pill-warn"
                : tone === "danger"
                    ? "ui-pill-danger"
                    : tone === "info"
                        ? "ui-pill-info"
                        : "ui-pill-neutral";

    return <span className={cn(cls, className)}>{children}</span>;
}