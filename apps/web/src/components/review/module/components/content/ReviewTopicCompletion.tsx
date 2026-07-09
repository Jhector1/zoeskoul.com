"use client";

import React from "react";
import type { ReviewModule } from "@/lib/subjects/types";
import SubjectFinishBanner from "../../components/finish/SubjectFinishBanner";
import type { SubjectFinishState } from "../../types/subjectFinish.types";

type ReviewTopicCompletionViewTopic = Pick<
    ReviewModule["topics"][number],
    "id" | "label" | "summary"
> & {
    outro?: {
        title?: string;
        body?: string;
        bullets?: string[];
    } | null;
};

type Props = {
    viewIsComplete: boolean;
    viewTopic: ReviewTopicCompletionViewTopic | null;
    onContinue?: () => void;
    continueLabel?: string;
    showSubjectFinish: boolean;
    subjectSlug: string;
    subjectFinish: SubjectFinishState | null;
    onOpenCertificate: () => void;
};

export default function ReviewTopicCompletion({
    viewIsComplete,
    viewTopic,
    onContinue,
    continueLabel = "Continue",
    showSubjectFinish,
    subjectSlug,
    subjectFinish,
    onOpenCertificate,
}: Props) {
    const showContinue = viewIsComplete && Boolean(onContinue);

    return (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3">
            {viewIsComplete ? (
                <section
                    className={[
                        "ui-surface-success ui-celebrate-card ui-celebrate-card-success",
                        "shrink-0 px-5 py-4",
                        "shadow-[0_18px_50px_rgb(0_0_0/0.22)]",
                    ].join(" ")}
                    aria-label="Topic complete"
                    data-review-topic-completion="true"
                >
                    <div className="flex items-start gap-3">
                        <div className="ui-celebrate-icon ui-celebrate-icon-success">
                            ✓
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="ui-celebrate-kicker">
                                    Topic complete
                                </div>

                                <span className="ui-celebrate-badge ui-celebrate-badge-success">
                                    Completed
                                </span>
                            </div>

                            <h3 className="mt-2 text-base font-semibold tracking-tight text-[rgb(var(--ui-text)/0.98)]">
                                {viewTopic?.outro?.title ?? "Nice — topic complete"}
                            </h3>

                            <p className="ui-celebrate-copy max-w-3xl">
                                {viewTopic?.outro?.body ??
                                    "You finished everything in this topic. You can move on or review anything you want."}
                            </p>

                            {Array.isArray(viewTopic?.outro?.bullets) &&
                            viewTopic.outro.bullets.length > 0 ? (
                                <ul className="ui-review-banner-list mt-3">
                                    {viewTopic.outro.bullets.map((bullet: string) => (
                                        <li key={bullet} className="ui-review-banner-item">
                                            <span className="ui-review-banner-mark">•</span>
                                            <span>{bullet}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    </div>

                    {showContinue ? (
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={onContinue}
                                className="ui-btn-primary h-10 px-5 text-sm font-semibold"
                                data-review-next-topic="true"
                            >
                                {continueLabel} <span aria-hidden>→</span>
                            </button>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {showSubjectFinish ? (
                <div className="shrink-0">
                    <SubjectFinishBanner
                        subjectSlug={subjectSlug}
                        subjectFinish={subjectFinish}
                        onOpenCertificate={onOpenCertificate}
                    />
                </div>
            ) : null}

            <div className="ui-surface-muted min-h-0 flex-1 rounded-none" />
        </div>
    );
}
