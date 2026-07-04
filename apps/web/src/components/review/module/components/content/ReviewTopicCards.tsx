"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { ReviewCard } from "@/lib/subjects/types";
import type {
  ReviewProgressState,
  ReviewTopicProgress,
  SavedQuizState,
} from "@/lib/subjects/progressTypes";

import CardRenderer from "@/components/review/module/CardRenderer";
import FlowNavigator from "@/components/review/navigation/FlowNavigator";
import { useReviewRuntimeStore } from "../../runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "../../runtime/runtimeProgressBridge";
import { clearReviewWorkspaceDrafts } from "@/components/tools/panes/reviewWorkspaceDrafts";
import { reviewDebug } from "../../runtime/reviewDebug";

import {
  canAutoMarkReadingCardDone,
  hasRequiredEmbeddedTryIt,
  isCardDoneFromState,
  isQuizLikeCard,
} from "../../progressKeys";
import {
  buildEmbeddedTryItPassProgress,
  buildMarkCardDoneProgress,
  buildQuizPassProgress,
  buildQuizResetProgress,
  buildQuizStateProgress,
  type QuizResetTarget,
} from "../../actions";

import { getCardStateKey } from "../../runtime/exerciseKeys";
import { useDebouncedSketchState } from "../../hooks/useDebouncedSketchState";

const TOPIC_PANE_ANIM = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

const TOPIC_PANE_TRANSITION = {
  duration: 0.22,
  ease: [0.16, 1, 0.3, 1] as const,
};

type Props = {
  motionKey: string;
  viewCards: ReviewCard[];
  activeCardIndex: number;
  unlockAll?: boolean;
  maxUnlockedCardIndex?: number;
  progressiveLockMessage?: string | null;
  onLockedNavigate?: () => void;
  navModes: { cards: "scroll" | "slideshow"; quiz: "scroll" | "slideshow" };
  reduceMotion: boolean;
  tp: ReviewTopicProgress;
  progressHydrated: boolean;
  versionStr: string;
  prereqsForAllQuizzes: boolean;
  viewTid: string;
  sketch: ReturnType<typeof useDebouncedSketchState>;
  setProgress: React.Dispatch<React.SetStateAction<ReviewProgressState>>;
  flushNow: (next: ReviewProgressState) => void;
  onRun?: () => void;
  onReveal?: () => void;
  onSubmit?: () => void;
  scrollToNextActionable: (fromIndex: number, nextProgress: ReviewProgressState) => void;
  setCardEl: (id: string) => (el: HTMLDivElement | null) => void;

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
  onBeforeCardNavigate?: () => Promise<void> | void;
  onActiveCardIndexChange?: (index: number) => void;
  onNavigateToExerciseRoute?: (args: { cardId: string; exerciseId: string }) => Promise<void> | void;
};

export default function ReviewTopicCards({
  motionKey,
  viewCards,
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
  viewTid,
  sketch,
  setProgress,
  flushNow,
  onRun,
  onReveal,
  onSubmit,
  scrollToNextActionable,
  setCardEl,
  subjectSlug,
  moduleSlug,
  sectionSlug,
  subjectRuntimeDefaults,
  courseRuntimeDefaults,
  moduleRuntimeDefaults,
  sectionRuntimeDefaults,
  topicRuntimeDefaults,
  routeExerciseId,
  defaultToolLanguage = "python",
  onActiveCardIndexChange,
  onNavigateToExerciseRoute,
  onBeforeCardNavigate,
}: Props) {
  const storeCards = useReviewRuntimeStore((s) => s.cards);
  const safeMaxUnlockedCardIndex = unlockAll
    ? Math.max(0, viewCards.length - 1)
    : Math.max(
      0,
      Math.min(viewCards.length - 1, maxUnlockedCardIndex ?? activeCardIndex),
    );
  const handleNavigate = React.useCallback(
      async (index: number) => {
        const clampedIndex = Math.max(0, Math.min(viewCards.length - 1, index));
        if (clampedIndex === activeCardIndex) return;
        if (!unlockAll && clampedIndex > safeMaxUnlockedCardIndex) {
          return;
        }
        const fromCard = viewCards[activeCardIndex] ?? null;

        /**
         * Production safety:
         * Before changing slideshow/card target, flush the active editor/tool
         * snapshot into runtime/progress and persist it.
         *
         * Without this, a learner can edit code and immediately click Previous/Next;
         * the card navigator then merges stale runtime state and the edit can be
         * lost or saved under the wrong target.
         */
        await onBeforeCardNavigate?.();

        sketch?.flushAll?.();

        setProgress((prev) => {
          const runtimeState = useReviewRuntimeStore.getState();

          reviewDebug("4_NAV_BEFORE_MERGE ReviewTopicCards.handleNavigate", {
            fromIndex: activeCardIndex,
            toIndex: clampedIndex,
            runtimeExerciseKeys: Object.keys(runtimeState.exercises ?? {}),
            runtimeCardKeys: Object.keys(runtimeState.cards ?? {}),
            prevTopicKeys: Object.keys(prev?.topics ?? {}),
          });

          let next = prev;

          if (
            fromCard &&
            !isQuizLikeCard(fromCard) &&
            canAutoMarkReadingCardDone(fromCard, next?.topics?.[viewTid])
          ) {
            next = buildMarkCardDoneProgress(next, viewTid, fromCard);
          }

          next = mergeRuntimeIntoProgress(next, runtimeState);

          reviewDebug("5_NAV_AFTER_MERGE ReviewTopicCards.handleNavigate", {
            fromIndex: activeCardIndex,
            toIndex: clampedIndex,
            nextTopicKeys: Object.keys(next?.topics ?? {}),
          });

          queueMicrotask(() => flushNow(next));

          return next;
        });

        onActiveCardIndexChange?.(clampedIndex);
      },
      [
        activeCardIndex,
        flushNow,
        onActiveCardIndexChange,
        onBeforeCardNavigate,
        setProgress,
        sketch,
        viewCards,
        viewTid,
        onLockedNavigate,
        safeMaxUnlockedCardIndex,
        unlockAll,
      ],
  );
  const activeCard = viewCards[activeCardIndex] ?? null;
  const activeCardDone = activeCard ? isCardDoneFromState(activeCard, tp) : false;
  const activeCardCanAdvance =
      unlockAll ||
      activeCardDone ||
      (activeCard
        ? !isQuizLikeCard(activeCard) && !hasRequiredEmbeddedTryIt(activeCard)
        : false);
  const hasNextCard = activeCardIndex < Math.max(0, viewCards.length - 1);
  const nextCardUnlocked = unlockAll || activeCardIndex + 1 <= safeMaxUnlockedCardIndex;
  return (
    <div className="flex min-h-0 shrink-0 flex-col">
      <AnimatePresence initial={false} mode="wait">
        <motion.div
            key={motionKey}
            initial={reduceMotion ? false : TOPIC_PANE_ANIM.initial}
            animate={TOPIC_PANE_ANIM.animate}
            exit={reduceMotion ? undefined : TOPIC_PANE_ANIM.exit}
            transition={reduceMotion ? { duration: 0 } : TOPIC_PANE_TRANSITION}
            className="flex min-h-0 shrink-0 flex-col will-change-transform"
        >
          {/*{progressiveLockMessage ? (*/}
          {/*    <div*/}
          {/*        role="status"*/}
          {/*        data-testid="review-progressive-lock-message"*/}
          {/*        className="mb-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100"*/}
          {/*    >*/}
          {/*      {progressiveLockMessage}*/}
          {/*    </div>*/}
          {/*) : null}*/}
          <FlowNavigator
            items={viewCards}
            mode={navModes.cards}
            activeIndex={activeCardIndex}
            onActiveIndexChange={handleNavigate}
            reduceMotion={reduceMotion}
            getKey={(card) => getCardStateKey({
              subjectSlug,
              moduleSlug,
              sectionSlug,
              topicId: viewTid,
              cardId: card.id,
            })}
            getProgressLabel={(index, total) => `Item ${index + 1} of ${total}`}
            canGoPrev={activeCardIndex > 0}
            canGoNext={hasNextCard && activeCardCanAdvance && nextCardUnlocked}
            onPrev={() => handleNavigate(activeCardIndex - 1)}
            onNext={() => handleNavigate(activeCardIndex + 1)}
            renderItem={(card, cardIndex: number) => {
              const cardKey = getCardStateKey({
                subjectSlug,
                moduleSlug,
                sectionSlug,
                topicId: viewTid,
                cardId: card.id,
              });

              const savedQuiz = (tp?.quizState?.[card.id] ??
                null) as SavedQuizState | null;

              const storeCard = storeCards[cardKey];
              const savedSketch =
                storeCard?.sketch ??
                tp?.sketchState?.[card.id] ??
                null;

              const done = isCardDoneFromState(card, tp);
              const prereqsMet = isQuizLikeCard(card)
                ? prereqsForAllQuizzes
                : true;

              return (
                <div key={cardKey} ref={setCardEl(card.id)}>
                  <CardRenderer
                    card={card}
                    cardKey={cardKey}
                    topicId={viewTid}
                    active={cardIndex === activeCardIndex}
                    done={done}
                    cardIndex={cardIndex}
                    quizNavMode={navModes.quiz}
                    prereqsMet={prereqsMet}
                    progressHydrated={progressHydrated}
                    savedQuiz={progressHydrated ? savedQuiz : null}
                    versionStr={versionStr}
                    savedSketch={savedSketch}
                    onRun={onRun}
                    onReveal={onReveal}
                    onSubmit={onSubmit}
                    routeExerciseId={routeExerciseId}
                    defaultToolLanguage={defaultToolLanguage}
                    onNavigateToExerciseRoute={onNavigateToExerciseRoute}
                    unlockAll={unlockAll}
                    onSketchStateChange={(_sketchCardId, state) => {
                      sketch?.saveSketchDebounced?.(cardKey, state, false);
                    }}
                    onMarkDone={() => {
                      setProgress((prev) => {
                        const next = buildMarkCardDoneProgress(prev, viewTid, card);
                        queueMicrotask(() => {
                          flushNow(next);
                          scrollToNextActionable(cardIndex, next);
                        });
                        return next;
                      });
                    }}
                    onEmbeddedTryItPass={(tryItId) => {
                      onSubmit?.();

                      setProgress((prev) => {
                        let next = buildEmbeddedTryItPassProgress(prev, viewTid, tryItId);
                        next = buildMarkCardDoneProgress(next, viewTid, card);

                        queueMicrotask(() => {
                          flushNow(next);
                          scrollToNextActionable(cardIndex, next);
                        });
                        return next;
                      });
                    }}
                    tp={tp}
                    onQuizPass={(quizId) => {
                      onSubmit?.();

                      setProgress((prev) => {
                        const next = buildQuizPassProgress(prev, viewTid, quizId, viewCards);
                        queueMicrotask(() => {
                          flushNow(next);
                          scrollToNextActionable(cardIndex, next);
                        });
                        return next;
                      });
                    }}
                    onQuizStateChange={(quizCardId, state) => {
                      if ("revealUsed" in state && state.revealUsed) onReveal?.();

                      setProgress((prev) => {
                        const next = buildQuizStateProgress(prev, viewTid, quizCardId, state);

                        return mergeRuntimeIntoProgress(
                          next,
                          useReviewRuntimeStore.getState(),
                        );
                      });
                    }}

                    onQuizReset={(target: string | QuizResetTarget) => {
                      const resetTarget: QuizResetTarget =
                          typeof target === "string"
                              ? { progressId: target, runtimeCardId: target, cardProgressKeys: [target] }
                              : target;

                      useReviewRuntimeStore
                          .getState()
                          .clearRuntimeForCard(
                              viewTid,
                              resetTarget.runtimeCardId ?? resetTarget.progressId,
                          );
                      clearReviewWorkspaceDrafts();

                      setProgress((prev) => {
                        const next = buildQuizResetProgress(
                            prev,
                            viewTid,
                            resetTarget,
                        );

                        queueMicrotask(() => flushNow(next));

                        return next;
                      });
                    }}
                    subjectRuntimeDefaults={subjectRuntimeDefaults}
                    courseRuntimeDefaults={courseRuntimeDefaults}
                    moduleRuntimeDefaults={moduleRuntimeDefaults}
                    sectionRuntimeDefaults={sectionRuntimeDefaults}
                    topicRuntimeDefaults={topicRuntimeDefaults}
                  />
                </div>
              );
            }}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
