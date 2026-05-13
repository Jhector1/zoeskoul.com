"use client";

import React from "react";
import TopicOutro from "../../components/TopicOutro";
import SubjectFinishBanner from "../../components/finish/SubjectFinishBanner";

type Props = {
    viewIsComplete: boolean;
    viewTopic: any;
    onContinue?: () => void;
    continueLabel?: string;
    showSubjectFinish: boolean;
    subjectSlug: string;
    subjectFinish: any;
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
                <div className="shrink-0">
                    <TopicOutro
                        topic={viewTopic}
                        continueLabel={continueLabel}
                    />
                </div>
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

            {showContinue ? (
                <div className="sticky bottom-4 z-30 mt-4 flex justify-end pointer-events-none">
                    <div className="ui-surface-floating rounded-2xl p-2 pointer-events-auto">
                        <button
                            type="button"
                            onClick={onContinue}
                            className="ui-btn-primary px-4"
                        >
                            {continueLabel} <span aria-hidden>→</span>
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}