"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { ReviewCard } from "@zoeskoul/curriculum-contracts/subjects/types";
import type {
  ReviewProgressState,
  ReviewTopicProgress,
  SavedQuizState,
} from "@/lib/subjects/progressTypes";

import CardRenderer from "@/components/review/module/CardRenderer";
import FlowNavigator from "@/components/review/navigation/FlowNavigator";
import { useReviewRuntimeStore } from "@zoeskoul/learning-runtime/review/module/runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "@zoeskoul/learning-runtime/review/module/runtime/runtimeProgressBridge";
import { clearReviewWorkspaceDrafts } from "@/components/tools/panes/reviewWorkspaceDrafts";
import { reviewDebug } from "@zoeskoul/learning-runtime/review/module/runtime/reviewDebug";

import {
  canAutoMarkReadingCardDone,
  hasRequiredEmbeddedTryIt,
  isCardDoneFromState,
  isQuizLikeCard,
} from "@zoeskoul/learning-runtime/review/module/progressKeys";
import {
  buildEmbeddedTryItPassProgress,
  buildMarkCardDoneProgress,
  buildQuizPassProgress,
  buildQuizResetProgress,
  buildQuizStateProgress,
  type QuizResetTarget,
} from "../../actions";

import { getCardStateKey } from "@zoeskoul/learning-runtime/review/module/runtime/exerciseKeys";
import { useDebouncedSketchState } from "../../hooks/useDebouncedSketchState";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";
import type { CompactQuizNavigationState } from "@zoeskoul/learning-runtime/review/module/compactFlowNavigation";
import type { ReviewWorkspaceCapabilities } from "@zoeskoul/learning-runtime/review/module/workspaceCapabilities";
import { resolveReviewFreeNavigation } from "@/components/review/module/reviewFreeNavigation";

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
  workspaceCapabilities: ReviewWorkspaceCapabilities;
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
  onCompactQuizNavigationChange?: (state: CompactQuizNavigationState | null) => void;
};

export default function ReviewTopicCards({
  motionKey,
  viewCards,
  activeCardIndex,
  unlockAll = false,
  workspaceCapabilities,
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
  onCompactQuizNavigationChange,
}: Props) {
  const freeNavigation = resolveReviewFreeNavigation({
    unlockAll,
    usesProgressGating: workspaceCapabilities.usesProgressGating,
  });
  const safeMaxUnlockedCardIndex = unlockAll || freeNavigation
    ? Math.max(0, viewCards.length - 1)
    : Math.max(
      0,
      Math.min(viewCards.length - 1, maxUnlockedCardIndex ?? activeCardIndex),
    );
  const handleNavigate = React.useCallback(
      async (index: number) => {
        const clampedIndex = Math.max(0, Math.min(viewCards.length - 1, index));
        if (clampedIndex === activeCardIndex) return;
        if (!unlockAll && !freeNavigation && clampedIndex > safeMaxUnlockedCardIndex) {
          return;
        }

        if (!workspaceCapabilities.canMutateProgress) {
          onActiveCardIndexChange?.(clampedIndex);
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
        freeNavigation,
        workspaceCapabilities.canMutateProgress,
      ],
  );
  const activeCard = viewCards[activeCardIndex] ?? null;
  const activeCardDone = activeCard ? isCardDoneFromState(activeCard, tp) : false;
  const activeCardCanAdvance =
      unlockAll ||
      freeNavigation ||
      activeCardDone ||
      (activeCard
        ? !isQuizLikeCard(activeCard) && !hasRequiredEmbeddedTryIt(activeCard)
        : false);
  const hasNextCard = activeCardIndex < Math.max(0, viewCards.length - 1);
  const nextCardUnlocked =
      unlockAll || freeNavigation || activeCardIndex + 1 <= safeMaxUnlockedCardIndex;
  const compactModeActive =
      learnerUiFlags.compactLearnerUi && !learnerUiFlags.showDebugLearningUi;

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
            showChrome={!compactModeActive}
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

              const savedSketch =
                tp?.sketchState?.[card.id] ??
                null;

              const done = isCardDoneFromState(card, tp);
              const prereqsMet = freeNavigation
                ? true
                : isQuizLikeCard(card)
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
                    isLastTopicCard={cardIndex === viewCards.length - 1}
                    quizNavMode={navModes.quiz}
                    prereqsMet={prereqsMet}
                    progressHydrated={progressHydrated}
                    savedQuiz={progressHydrated ? savedQuiz : null}
                    versionStr={versionStr}
                    savedSketch={savedSketch}
                    onRun={workspaceCapabilities.canSubmitPractice ? onRun : undefined}
                    onReveal={workspaceCapabilities.canSubmitPractice ? onReveal : undefined}
                    onSubmit={workspaceCapabilities.canSubmitPractice ? onSubmit : undefined}
                    routeExerciseId={routeExerciseId}
                    defaultToolLanguage={defaultToolLanguage}
                    onNavigateToExerciseRoute={onNavigateToExerciseRoute}
                    onCompactQuizNavigationChange={cardIndex === activeCardIndex ? onCompactQuizNavigationChange : undefined}
                    unlockAll={unlockAll || freeNavigation}
                    workspaceCapabilities={workspaceCapabilities}
                    onSketchStateChange={(_sketchCardId, state) => {
                      if (!workspaceCapabilities.canEditWorkspace) return;
                      sketch?.saveSketchDebounced?.(cardKey, state, false);
                    }}
                    onMarkDone={() => {
                      if (!workspaceCapabilities.canMutateProgress) return;
                      setProgress((prev) => {
                        const next = buildMarkCardDoneProgress(prev, viewTid, card);
                        queueMicrotask(() => {
                          flushNow(next);
                          scrollToNextActionable(cardIndex, next);
                        });
                        return next;
                      });
                    }}
                    onEmbeddedTryItPass={(tryItId, reason) => {
                      if (!workspaceCapabilities.canMutateProgress) return;
                      // Reveal finalization completes navigation with zero credit.
                      // Only a real pass triggers the existing submit/credit hook.
                      if (reason === "passed") onSubmit?.();

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
                    onQuizPass={(quizId, reason) => {
                      if (!workspaceCapabilities.canMutateProgress) return;
                      // Keep completion separate from correctness/credit.
                      if (reason === "passed") onSubmit?.();

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
                      if (!workspaceCapabilities.canMutateProgress) return;
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
                      if (!workspaceCapabilities.canMutateProgress) return;
                      const resetTarget: QuizResetTarget =
                          typeof target === "string"
                              ? { progressId: target, runtimeCardId: target, cardProgressKeys: [target] }
                              : target;

                      const runtimeStore = useReviewRuntimeStore.getState();
                      const runtimeCardId =
                          resetTarget.runtimeCardId ?? resetTarget.progressId;
                      const resetResult = resetTarget.exerciseId
                          ? runtimeStore.resetExerciseToStarter({
                              topicId: viewTid,
                              cardId: runtimeCardId,
                              exerciseId: resetTarget.exerciseId,
                              exerciseStateKey: resetTarget.exerciseStateKey,
                          })
                          : null;

                      if (!resetTarget.exerciseId) {
                        runtimeStore.clearRuntimeForCard(viewTid, runtimeCardId);
                      }

                      if (resetResult?.exerciseKey) {
                        clearReviewWorkspaceDrafts(
                            (ownerKey) => ownerKey === resetResult.exerciseKey,
                        );
                      } else {
                        clearReviewWorkspaceDrafts((ownerKey) => {
                          const parts = ownerKey.split(":").filter(Boolean);
                          return (
                              (parts[3] ?? "") === viewTid &&
                              (parts[4] ?? "") === runtimeCardId
                          );
                        });
                      }

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
