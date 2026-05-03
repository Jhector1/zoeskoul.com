"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { ReviewCard } from "@/lib/subjects/types";
import type { SavedQuizState } from "@/lib/subjects/progressTypes";

import CardRenderer from "@/components/review/module/CardRenderer";
import FlowNavigator from "@/components/review/navigation/FlowNavigator";
import { useReviewRuntimeStore } from "../../runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "../../runtime/runtimeProgressBridge";
import { reviewDebug } from "../../runtime/reviewDebug";

import { isCardDoneFromState, isQuizLikeCard } from "../../progressKeys";
import {
  buildMarkCardDoneProgress,
  buildQuizPassProgress,
  buildQuizResetProgress,
  buildQuizStateProgress,
} from "../../actions";

import { getCardStateKey } from "../../runtime/exerciseKeys";

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
  navModes: { cards: "scroll" | "slideshow"; quiz: "scroll" | "slideshow" };
  reduceMotion: boolean;
  tp: any;
  progressHydrated: boolean;
  versionStr: string;
  prereqsForAllQuizzes: boolean;
  viewTid: string;
  sketch: any;
  setProgress: React.Dispatch<any>;
  flushNow: (next: any) => void;
  onRun?: () => void;
  onReveal?: () => void;
  onSubmit?: () => void;
  scrollToNextActionable: (fromIndex: number, nextProgress: any) => void;
  setCardEl: (id: string) => (el: HTMLDivElement | null) => void;

  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string;

  onActiveCardIndexChange?: (index: number) => void;
};

export default function ReviewTopicCards({
  motionKey,
  viewCards,
  activeCardIndex,
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
  onActiveCardIndexChange,
}: Props) {
  const goToCard = useReviewRuntimeStore((s) => s.goToCard);
  const storeCards = useReviewRuntimeStore((s) => s.cards);

  const handleNavigate = React.useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(viewCards.length - 1, index));
      if (clampedIndex === activeCardIndex) return;

      /**
       * Flush sketch/card refs first. Then merge the latest Zustand runtime
       * into ReviewProgressState before changing cards.
       */
      sketch?.flushAll?.();

      setProgress((prev: any) => {
        const runtimeState = useReviewRuntimeStore.getState();

        reviewDebug("4_NAV_BEFORE_MERGE ReviewTopicCards.handleNavigate", {
          fromIndex: activeCardIndex,
          toIndex: clampedIndex,
          runtimeExerciseKeys: Object.keys(runtimeState.exercises ?? {}),
          runtimeCardKeys: Object.keys(runtimeState.cards ?? {}),
          prevTopicKeys: Object.keys(prev?.topics ?? {}),
        });

        const next = mergeRuntimeIntoProgress(prev, runtimeState);

        reviewDebug("5_NAV_AFTER_MERGE ReviewTopicCards.handleNavigate", {
          fromIndex: activeCardIndex,
          toIndex: clampedIndex,
          nextTopicKeys: Object.keys(next?.topics ?? {}),
        });

        queueMicrotask(() => flushNow(next));

        return next;
      });

      goToCard(clampedIndex);

      onActiveCardIndexChange?.(clampedIndex);
    },
    [
      activeCardIndex,
      flushNow,
      goToCard,
      onActiveCardIndexChange,
      setProgress,
      sketch,
      viewCards.length,
    ],
  );

  return (
    <div className="flex min-h-0 shrink-0 flex-col">
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={motionKey}
          initial={reduceMotion ? false : TOPIC_PANE_ANIM.initial}
          animate={TOPIC_PANE_ANIM.animate}
          exit={reduceMotion ? undefined : TOPIC_PANE_ANIM.exit}
          transition={reduceMotion ? { duration: 0 } : TOPIC_PANE_TRANSITION}
          className="flex min-h-0 shrink-0 flex-col"
        >
          <FlowNavigator
            items={viewCards}
            mode={navModes.cards}
            activeIndex={activeCardIndex}
            onActiveIndexChange={handleNavigate}
            reduceMotion={reduceMotion}
            getKey={(card: any) => card.id}
            getProgressLabel={(index, total) => `Item ${index + 1} of ${total}`}
            canGoPrev={activeCardIndex > 0}
            canGoNext={activeCardIndex < Math.max(0, viewCards.length - 1)}
            onPrev={() => handleNavigate(activeCardIndex - 1)}
            onNext={() => handleNavigate(activeCardIndex + 1)}
            renderItem={(card: any, cardIndex: number) => {
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
                <div key={card.id} ref={setCardEl(card.id)}>
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
                    onSketchStateChange={(_sketchCardId, state) => {
                      sketch?.saveSketchDebounced?.(cardKey, state, false);
                    }}
                    onMarkDone={() => {
                      setProgress((prev: any) => {
                        const next = buildMarkCardDoneProgress(prev, viewTid, card);
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

                      setProgress((prev: any) => {
                        const next = buildQuizPassProgress(prev, viewTid, quizId);
                        queueMicrotask(() => {
                          flushNow(next);
                          scrollToNextActionable(cardIndex, next);
                        });
                        return next;
                      });
                    }}
                    onQuizStateChange={(quizCardId, state) => {
                      if ((state as any)?.revealUsed) onReveal?.();

                      setProgress((prev: any) => {
                        const next = buildQuizStateProgress(prev, viewTid, quizCardId, state);

                        return mergeRuntimeIntoProgress(
                          next,
                          useReviewRuntimeStore.getState(),
                        );
                      });
                    }}
                    onQuizReset={(quizCardId) => {
                      setProgress((prev: any) => {
                        const next = buildQuizResetProgress(
                          prev,
                          viewTid,
                          quizCardId,
                        );
                        queueMicrotask(() => flushNow(next));
                        return next;
                      });
                    }}
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
