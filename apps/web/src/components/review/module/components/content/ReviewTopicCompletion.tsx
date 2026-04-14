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
        <>
            {viewIsComplete ? (
                <div className="mt-3 shrink-0">
                    <TopicOutro
                        topic={viewTopic}
                        onContinue={onContinue}
                        continueLabel={continueLabel}
                    />
                </div>
            ) : null}

            {showSubjectFinish ? (
                <SubjectFinishBanner
                    subjectSlug={subjectSlug}
                    subjectFinish={subjectFinish}
                    onOpenCertificate={onOpenCertificate}
                />
            ) : null}

            <div className="ui-surface-muted mt-2 flex-1 min-h-0 overflow-auto rounded-none" />
        </>
    );
}