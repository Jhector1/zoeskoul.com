"use client";

import React from "react";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import { cn } from "@/lib/cn";
import Badge from "@/components/billing/Badge";

function feedbackSurfaceClass(tone?: string) {
    if (tone === "danger") return "ui-surface-danger";
    if (tone === "warning") return "ui-surface-warn";
    return "ui-surface-soft";
}

function feedbackBadgeTone(
    tone?: string,
): "neutral" | "good" | "warn" | "danger" | "info" {
    if (tone === "danger") return "danger";
    if (tone === "warning") return "warn";
    return "info";
}

export default function CodeFeedbackCallout({
                                                feedback,
                                                explanation,
                                            }: {
    feedback?: CodeFeedback | null;
    explanation?: string | null;
}) {
    const body = feedback?.message?.trim() || explanation?.trim();
    if (!body) return null;

    return (
        <div className={cn("p-3", feedbackSurfaceClass(feedback?.tone))}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="ui-title-sm">{feedback?.title ?? "Feedback"}</div>

                {typeof feedback?.line === "number" ? (
                    <Badge tone={feedbackBadgeTone(feedback?.tone)}>
                        Line {feedback.line}
                    </Badge>
                ) : null}
            </div>

            <div className="mt-1 text-sm leading-6 text-[rgb(var(--ui-text)/0.9)]">
                {body}
            </div>

            {feedback?.raw ? (
                <details className="mt-3">
                    <summary className="cursor-pointer ui-meta-strong">
                        Debug details
                    </summary>

                    <pre className="ui-surface-muted mt-2 overflow-auto p-3 text-[11px] leading-relaxed">
            {feedback.raw}
          </pre>
                </details>
            ) : null}
        </div>
    );
}