"use client";

import React from "react";
import TopicShell from "../../components/TopicShell";
import ReviewTopicCards from "./ReviewTopicCards";
import ReviewTopicCompletion from "./ReviewTopicCompletion";
import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import type {
    ReviewProgressState,
    ReviewTopicProgress,
} from "@/lib/subjects/progressTypes";
import type { SubjectFinishState } from "../../types/subjectFinish.types";
import { useDebouncedSketchState } from "../../hooks/useDebouncedSketchState";

type Props = {
    leftCollapsedEff: boolean;
    onOpenTopics: () => void;
    mainScrollRef: React.RefObject<HTMLElement | null>;
    padStyle: React.CSSProperties;
    viewTopic: ReviewModule["topics"][number] | null;
    viewCards: ReviewCard[];
    viewTid: string;
    activeCardIndex: number;
    navModes: { cards: "scroll" | "slideshow"; quiz: "scroll" | "slideshow" };
    reduceMotion: boolean;
    tp: ReviewTopicProgress;
    progressHydrated: boolean;
    versionStr: string;
    prereqsForAllQuizzes: boolean;
    sketch: ReturnType<typeof useDebouncedSketchState>;
    setProgress: React.Dispatch<React.SetStateAction<ReviewProgressState>>;
    flushNow: (next: ReviewProgressState) => void;
    onRun?: () => void;
    onReveal?: () => void;
    onSubmit?: () => void;
    scrollToNextActionable: (fromIndex: number, nextProgress: ReviewProgressState) => void;
    setCardEl: (id: string) => (el: HTMLDivElement | null) => void;
    viewIsComplete: boolean;
    onContinue?: () => void;
    continueLabel?: string;
    showSubjectFinish: boolean;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug?: string;
    defaultToolLanguage?: string;
    subjectFinish: SubjectFinishState | null;
    onOpenCertificate: () => void;
    onActiveCardIndexChange?: (index: number) => void;
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
    navModes,
    reduceMotion,
    tp,
    progressHydrated,
    versionStr,
    prereqsForAllQuizzes,
    sketch,
    setProgress,
    flushNow,
    onRun,
    onReveal,
    onSubmit,
    scrollToNextActionable,
    setCardEl,
    viewIsComplete,
    onContinue,
    continueLabel,
    showSubjectFinish,
    subjectSlug,
    moduleSlug,
    sectionSlug,
    defaultToolLanguage,
    subjectFinish,
    onOpenCertificate,
    onActiveCardIndexChange,
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
                        onRun={onRun}
                        onReveal={onReveal}
                        onSubmit={onSubmit}
                        scrollToNextActionable={scrollToNextActionable}
                        setCardEl={setCardEl}
                        subjectSlug={subjectSlug}
                        moduleSlug={moduleSlug}
                        sectionSlug={sectionSlug}
                        defaultToolLanguage={defaultToolLanguage}
                        onActiveCardIndexChange={onActiveCardIndexChange}
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
