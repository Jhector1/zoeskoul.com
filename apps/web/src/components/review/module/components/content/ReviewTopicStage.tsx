"use client";

import React from "react";
import { cn } from "@/lib/cn";
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
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";
import type { CompactQuizNavigationState } from "../../compactFlowNavigation";

type Props = {
    leftCollapsedEff: boolean;
    onOpenTopics: () => void;
    mobileToolsPanel?: React.ReactNode;
    showMobileWorkspaceTabs?: boolean;
    activeMobileWorkspaceTab?: "lesson" | "code";
    onMobileWorkspaceTabChange?: (tab: "lesson" | "code") => void;
    mainScrollRef: React.RefObject<HTMLElement | null>;
    padStyle: React.CSSProperties;
    viewTopic: ReviewModule["topics"][number] | null;
    viewCards: ReviewCard[];
    viewTid: string;
    activeCardIndex: number;
    unlockAll?: boolean;
    maxUnlockedCardIndex?: number;
    progressiveLockMessage?: string | null;
    onLockedNavigate?: () => void;
    navModes: { cards: "scroll" | "slideshow"; quiz: "scroll" | "slideshow" };
    reduceMotion: boolean;
    tp: ReviewTopicProgress;
    onBeforeCardNavigate?: () => Promise<void> | void;
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
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
    routeExerciseId?: string | null;
    defaultToolLanguage?: string;
    subjectFinish: SubjectFinishState | null;
    onOpenCertificate: () => void;
    onActiveCardIndexChange?: (index: number) => void;
    onNavigateToExerciseRoute?: (args: { cardId: string; exerciseId: string }) => Promise<void> | void;
    onCompactQuizNavigationChange?: (state: CompactQuizNavigationState | null) => void;
};

export default function ReviewTopicStage({
    leftCollapsedEff,
    onOpenTopics,
    mobileToolsPanel,
    showMobileWorkspaceTabs = false,
    activeMobileWorkspaceTab = "lesson",
    onMobileWorkspaceTabChange,
    mainScrollRef,
    padStyle,
    viewTopic,
    viewCards,
    viewTid,
    activeCardIndex,
    unlockAll = false,
                                             maxUnlockedCardIndex,
                                             progressiveLockMessage,
                                             onLockedNavigate,
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
    subjectRuntimeDefaults,
    courseRuntimeDefaults,
    moduleRuntimeDefaults,
    sectionRuntimeDefaults,
    topicRuntimeDefaults,
    routeExerciseId,
    defaultToolLanguage,
    subjectFinish,
    onOpenCertificate,
    onActiveCardIndexChange,
    onNavigateToExerciseRoute,
    onCompactQuizNavigationChange,


                                             onBeforeCardNavigate,
}: Props) {
    const useWorkspaceTabs = Boolean(showMobileWorkspaceTabs && mobileToolsPanel);
    const activeTab = useWorkspaceTabs ? activeMobileWorkspaceTab : "lesson";
    const activeCard = viewCards[activeCardIndex] ?? null;
    const cardExplicitlyHidesTools = activeCard?.tools?.defaultVisible === false;
    const shouldConstrainQuizWidth =
        learnerUiFlags.compactLearnerUi &&
        !learnerUiFlags.showDebugLearningUi &&
        activeCard?.type === "quiz";
    const shouldConstrainReadingWidth =
        cardExplicitlyHidesTools &&
        (activeCard?.type === "sketch" ||
            activeCard?.type === "text" ||
            activeCard?.type === "video");
    const constrainContentWidth =
        shouldConstrainQuizWidth || shouldConstrainReadingWidth;
    const setActiveTab = (tab: "lesson" | "code") => {
        onMobileWorkspaceTabChange?.(tab);
    };

    const lessonContent = (
        <TopicShell title={viewTopic?.label ?? ""} subtitle={viewTopic?.summary ?? null}>
            <div
                className={cn(
                    "flex min-h-full flex-col pb-28",
                    constrainContentWidth && "mx-auto w-full max-w-4xl",
                )}
            >
                <ReviewTopicCards
                    motionKey={`${viewTid}:${versionStr}`}
                    viewCards={viewCards}
                    activeCardIndex={activeCardIndex}
                    unlockAll={unlockAll}
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
                    subjectRuntimeDefaults={subjectRuntimeDefaults}
                    courseRuntimeDefaults={courseRuntimeDefaults}
                    moduleRuntimeDefaults={moduleRuntimeDefaults}
                    sectionRuntimeDefaults={sectionRuntimeDefaults}
                    topicRuntimeDefaults={topicRuntimeDefaults}
                    routeExerciseId={routeExerciseId}
                    defaultToolLanguage={defaultToolLanguage}
                    onActiveCardIndexChange={onActiveCardIndexChange}
                    onNavigateToExerciseRoute={onNavigateToExerciseRoute}
                    onCompactQuizNavigationChange={onCompactQuizNavigationChange}
                    onBeforeCardNavigate={onBeforeCardNavigate}
                    maxUnlockedCardIndex={maxUnlockedCardIndex}
                    progressiveLockMessage={progressiveLockMessage}
                    onLockedNavigate={onLockedNavigate}
                />
                {!useWorkspaceTabs ? mobileToolsPanel : null}
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
    );

    // const topicsButton = leftCollapsedEff ? (
    //     <div className="mb-3 flex gap-2 px-3 pt-3">
    //         <button
    //             type="button"
    //             onClick={onOpenTopics}
    //             className="ui-btn ui-btn-secondary text-xs font-extrabold"
    //         >
    //             Topics ▶
    //         </button>
    //     </div>
    // ) : null;

    if (useWorkspaceTabs) {
        return (
            <main
                ref={mainScrollRef}
                className="flex-1 min-w-0 min-h-0 overflow-hidden"
                style={padStyle}
            >
                <div className="flex h-full min-h-0 flex-col">
                    {/*{topicsButton}*/}
                    <div
                        data-mobile-workspace-chrome="true"
                        className="shrink-0 border-b border-[rgb(var(--ui-border)/0.75)] bg-[rgb(var(--ui-surface)/0.94)] p-3 backdrop-blur"
                    >
                        <div
                            className="mx-auto grid max-w-xl grid-cols-2 rounded-full bg-[rgb(var(--ui-muted)/0.7)] p-1 text-sm font-black"
                            role="tablist"
                            aria-label="Lesson and code workspace"
                            data-testid="review-mobile-workspace-tabs"
                        >
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "lesson"}
                                onClick={() => setActiveTab("lesson")}
                                className={cn(
                                    "rounded-full px-4 py-2 transition",
                                    activeTab === "lesson"
                                        ? "bg-[rgb(var(--ui-surface)/0.96)] text-[rgb(var(--ui-text))] shadow-sm"
                                        : "text-[rgb(var(--ui-text-muted))] hover:text-[rgb(var(--ui-text))]",
                                )}
                            >
                                Lesson
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === "code"}
                                onClick={() => setActiveTab("code")}
                                className={cn(
                                    "rounded-full px-4 py-2 transition",
                                    activeTab === "code"
                                        ? "bg-[rgb(var(--ui-surface)/0.96)] text-[rgb(var(--ui-text))] shadow-sm"
                                        : "text-[rgb(var(--ui-text-muted))] hover:text-[rgb(var(--ui-text))]",
                                )}
                            >
                                Code
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">
                        <section
                            className={cn("h-full min-h-0 overflow-auto", activeTab !== "lesson" && "hidden")}
                            role="tabpanel"
                            aria-hidden={activeTab !== "lesson"}
                            data-testid="review-mobile-lesson-panel"
                        >
                            {lessonContent}
                        </section>

                        <section
                            className={cn("h-full min-h-0 overflow-hidden", activeTab !== "code" && "hidden")}
                            role="tabpanel"
                            aria-hidden={activeTab !== "code"}
                            data-testid="review-mobile-code-panel"
                        >
                            {mobileToolsPanel}
                        </section>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main
            ref={mainScrollRef}
            className="flex-1 min-w-0 min-h-0 overflow-auto"
            style={padStyle}
        >
            {/*{topicsButton}*/}
            {lessonContent}
        </main>
    );
}
