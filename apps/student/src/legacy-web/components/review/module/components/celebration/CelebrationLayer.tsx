"use client";

import React from "react";
import { AnimatePresence } from "framer-motion";
import CourseCompleteConfetti from "@/components/review/module/components/CourseCompleteConfetti";

import CourseCelebrateModal from "./CourseCelebrateModal";
import ModuleCelebrateModal from "./ModuleCelebrateModal";
import TopicCelebrateToast from "./TopicCelebrateToast";

import type {
    CelebrateCopy,
    CourseCelebrateCopy,
    TopicCelebrateToast as TopicCelebrateToastVm,
} from "../../hooks/useReviewCelebrations";

type Props = {
    reduceMotion: boolean;

    courseCelebrateOpen: boolean;
    setCourseCelebrateOpen: (open: boolean) => void;
    courseCelebrateBurstKey: number;
    courseCelebrateCopy: CourseCelebrateCopy;
    handleOpenCertificate: () => void;

    moduleCelebrateOpen: boolean;
    setModuleCelebrateOpen: (open: boolean) => void;
    moduleCelebrateCopy: CelebrateCopy;
    moduleProgress: { total: number; done: number; pct: number };

    outroContinueEnabled: boolean;
    outroContinueLabel: string;
    isModuleContinuePending: boolean;
    onModuleContinue: () => void;

    topicToast: TopicCelebrateToastVm | null;
    setTopicToastPaused: (paused: boolean) => void;
    dismissTopicToast: () => void;
};

export default function CelebrationLayer({
                                             reduceMotion,
                                             courseCelebrateOpen,
                                             setCourseCelebrateOpen,
                                             courseCelebrateBurstKey,
                                             courseCelebrateCopy,
                                             handleOpenCertificate,
                                             moduleCelebrateOpen,
                                             setModuleCelebrateOpen,
                                             moduleCelebrateCopy,
                                             moduleProgress,
                                             outroContinueEnabled,
                                             outroContinueLabel,
                                             isModuleContinuePending,
                                             onModuleContinue,
                                             topicToast,
                                             setTopicToastPaused,
                                             dismissTopicToast,
                                         }: Props) {
    return (
        <>
            <CourseCompleteConfetti
                open={courseCelebrateOpen}
                reduceMotion={reduceMotion}
                burstKey={courseCelebrateBurstKey}
                count={92}
            />

            <AnimatePresence>
                {courseCelebrateOpen ? (
                    <CourseCelebrateModal
                        reduceMotion={reduceMotion}
                        copy={courseCelebrateCopy}
                        onPrimary={() => {
                            setCourseCelebrateOpen(false);
                            handleOpenCertificate();
                        }}
                        onClose={() => setCourseCelebrateOpen(false)}
                    />
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {moduleCelebrateOpen ? (
                    <ModuleCelebrateModal
                        reduceMotion={reduceMotion}
                        copy={moduleCelebrateCopy}
                        moduleProgress={moduleProgress}
                        outroContinueEnabled={outroContinueEnabled}
                        outroContinueLabel={outroContinueLabel}
                        isPending={isModuleContinuePending}
                        onContinue={onModuleContinue}
                        onClose={() => setModuleCelebrateOpen(false)}
                    />
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {topicToast ? (
                    <TopicCelebrateToast
                        reduceMotion={reduceMotion}
                        toast={topicToast}
                        onPauseChange={setTopicToastPaused}
                        onDismiss={dismissTopicToast}
                    />
                ) : null}
            </AnimatePresence>
        </>
    );
}
