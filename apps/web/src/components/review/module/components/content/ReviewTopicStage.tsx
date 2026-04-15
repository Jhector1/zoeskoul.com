"use client";

import React from "react";
import TopicShell from "../../components/TopicShell";
import ReviewTopicCards from "./ReviewTopicCards";
import ReviewTopicCompletion from "./ReviewTopicCompletion";
import type { ReviewCard } from "@/lib/subjects/types";

type Props = {
    leftCollapsedEff: boolean;
    onOpenTopics: () => void;
    mainScrollRef: React.RefObject<HTMLElement | null>;
    padStyle: React.CSSProperties;
    viewTopic: any;
    viewCards: ReviewCard[];
    viewTid: string;
    activeCardIndex: number;
    onActiveCardIndexChange: (index: number) => void;
    navModes: { cards: "scroll" | "slideshow"; quiz: "scroll" | "slideshow" };
    reduceMotion: boolean;
    tp: any;
    progressHydrated: boolean;
    versionStr: string;
    prereqsForAllQuizzes: boolean;
    sketch: any;
    setProgress: React.Dispatch<any>;
    flushNow: (next: any) => void;
    scrollToNextActionable: (fromIndex: number, nextProgress: any) => void;
    setCardEl: (id: string) => (el: HTMLDivElement | null) => void;
    viewIsComplete: boolean;
    onContinue?: () => void;
    continueLabel?: string;
    showSubjectFinish: boolean;
    subjectSlug: string;
    subjectFinish: any;
    onOpenCertificate: () => void;
};

export default function ReviewTopicStage({
                                             leftCollapsedEff,
                                             onOpenTopics,
                                             mainScrollRef,
                                             padStyle,
                                             viewTopic,
                                             viewCards,
                                             viewTid,
                                             activeCardIndex,
                                             onActiveCardIndexChange,
                                             navModes,
                                             reduceMotion,
                                             tp,
                                             progressHydrated,
                                             versionStr,
                                             prereqsForAllQuizzes,
                                             sketch,
                                             setProgress,
                                             flushNow,
                                             scrollToNextActionable,
                                             setCardEl,
                                             viewIsComplete,
                                             onContinue,
                                             continueLabel,
                                             showSubjectFinish,
                                             subjectSlug,
                                             subjectFinish,
                                             onOpenCertificate,
                                         }: Props) {
    return (
        <main
            ref={mainScrollRef}
            className="flex-1 min-w-0 min-h-0 overflow-auto"
            style={padStyle}
        >
            {leftCollapsedEff ? (
                <div className="mb-3 flex gap-2">
                    <button
                        type="button"
                        onClick={onOpenTopics}
                        className="ui-btn ui-btn-secondary text-xs font-extrabold"
                    >
                        Topics ▶
                    </button>
                </div>
            ) : null}

            <TopicShell title={viewTopic?.label ?? ""} subtitle={viewTopic?.summary ?? null}>
                <div className="flex min-h-full flex-col">
                    <ReviewTopicCards
                        motionKey={`${viewTid}:${versionStr}`}
                        viewCards={viewCards}
                        activeCardIndex={activeCardIndex}
                        onActiveCardIndexChange={onActiveCardIndexChange}
                        navModes={navModes}
                        reduceMotion={reduceMotion}
                        tp={tp}
                        progressHydrated={progressHydrated}
                        versionStr={versionStr}
                        prereqsForAllQuizzes={prereqsForAllQuizzes}
                        viewTid={viewTid}
                        sketch={sketch}
                        setProgress={setProgress}
                        flushNow={flushNow}
                        scrollToNextActionable={scrollToNextActionable}
                        setCardEl={setCardEl}
                    />

                    <ReviewTopicCompletion
                        viewIsComplete={viewIsComplete}
                        viewTopic={viewTopic}
                        onContinue={onContinue}
                        continueLabel={continueLabel}
                        showSubjectFinish={showSubjectFinish}
                        subjectSlug={subjectSlug}
                        subjectFinish={subjectFinish}
                        onOpenCertificate={onOpenCertificate}
                    />
                </div>
            </TopicShell>
        </main>
    );
}