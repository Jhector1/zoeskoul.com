"use client";

import React from "react";
import { useTaggedT } from "@/i18n/tagged";
import type { CodeFeedback, CodeFeedbackTone } from "@/lib/code/feedback/types";
import { cn } from "@/lib/cn";
import Badge from "@/components/billing/Badge";

function resolveFeedbackTone(args: {
    feedback?: CodeFeedback | null;
    explanation?: string | null;
}): CodeFeedbackTone {
    if (args.feedback?.tone) return args.feedback.tone;

    // Plain check explanations like "Missing required file: tools/badges.py"
    // should look like warning feedback, not a neutral card.
    if (args.explanation?.trim()) return "warning";

    return "info";
}

function feedbackSurfaceClass(tone: CodeFeedbackTone) {
    if (tone === "danger") return "ui-surface-danger";
    if (tone === "warning") return "ui-surface-warn";
    return "ui-surface-soft";
}

function feedbackBadgeTone(
    tone: CodeFeedbackTone,
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
    const tagged = useTaggedT();
    const rawBody = feedback?.message?.trim() || explanation?.trim();
    const body = tagged.resolve(rawBody, rawBody);
    if (!body) return null;

    const rawTitle = feedback?.title ?? "Feedback";
    const title = tagged.resolve(rawTitle, rawTitle);
    const tone = resolveFeedbackTone({ feedback, explanation: body });

    return (
        <div className={cn("p-3", feedbackSurfaceClass(tone))}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="ui-title-sm">{title}</div>

                {typeof feedback?.line === "number" ? (
                    <Badge tone={feedbackBadgeTone(tone)}>
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