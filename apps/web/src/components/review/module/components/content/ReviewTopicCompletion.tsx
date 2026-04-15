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
                                                  continueLabel,
                                                  showSubjectFinish,
                                                  subjectSlug,
                                                  subjectFinish,
                                                  onOpenCertificate,
                                              }: Props) {
    return (
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-3">
            {viewIsComplete ? (
                <div className="shrink-0">
                    <TopicOutro
                        topic={viewTopic}
                        onContinue={onContinue}
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
        </div>
    );
}