"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { ReviewCard } from "@/lib/subjects/types";
import type { SavedQuizState } from "@/lib/subjects/progressTypes";

import CardRenderer from "@/components/review/module/CardRenderer";
import FlowNavigator from "@/components/review/navigation/FlowNavigator";

import { isCardDoneFromState, isQuizLikeCard } from "../../progressKeys";
import {
    buildMarkCardDoneProgress,
    buildQuizPassProgress,
    buildQuizResetProgress,
    buildQuizStateProgress,
} from "../../actions";

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
    onActiveCardIndexChange: (index: number) => void;
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
    scrollToNextActionable: (fromIndex: number, nextProgress: any) => void;
    setCardEl: (id: string) => (el: HTMLDivElement | null) => void;
};

export default function ReviewTopicCards({
                                             motionKey,
                                             viewCards,
                                             activeCardIndex,
                                             onActiveCardIndexChange,
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
                                             scrollToNextActionable,
                                             setCardEl,
                                         }: Props) {
    return (
        <div className="flex min-h-0 flex-col shrink-0">
            <AnimatePresence initial={false} mode="wait">
                <motion.div
                    key={motionKey}
                    initial={reduceMotion ? false : TOPIC_PANE_ANIM.initial}
                    animate={TOPIC_PANE_ANIM.animate}
                    exit={reduceMotion ? undefined : TOPIC_PANE_ANIM.exit}
                    transition={reduceMotion ? { duration: 0 } : TOPIC_PANE_TRANSITION}
                    className="flex min-h-0 flex-col shrink-0"
                >
                    <FlowNavigator
                        items={viewCards}
                        mode={navModes.cards}
                        activeIndex={activeCardIndex}
                        onActiveIndexChange={onActiveCardIndexChange}
                        reduceMotion={reduceMotion}
                        getKey={(card: any) => card.id}
                        getProgressLabel={(index, total) => `Item ${index + 1} of ${total}`}
                        canGoPrev={activeCardIndex > 0}
                        canGoNext={activeCardIndex < Math.max(0, viewCards.length - 1)}
                        onPrev={() => onActiveCardIndexChange(Math.max(0, activeCardIndex - 1))}
                        onNext={() =>
                            onActiveCardIndexChange(
                                Math.min(viewCards.length - 1, activeCardIndex + 1),
                            )
                        }
                        renderItem={(card: any, cardIndex: number) => {
                            const savedQuiz = (tp?.quizState?.[card.id] ?? null) as SavedQuizState | null;
                            const savedSketch = tp?.sketchState?.[card.id] ?? null;

                            const done = isCardDoneFromState(card, tp);
                            const prereqsMet = isQuizLikeCard(card) ? prereqsForAllQuizzes : true;

                            return (
                                <div key={card.id} ref={setCardEl(card.id)}>
                                    <CardRenderer
                                        card={card}
                                        done={done}
                                        cardIndex={cardIndex}
                                        quizNavMode={navModes.quiz}
                                        prereqsMet={prereqsMet}
                                        progressHydrated={progressHydrated}
                                        savedQuiz={progressHydrated ? savedQuiz : null}
                                        versionStr={versionStr}
                                        savedSketch={progressHydrated ? savedSketch : null}
                                        onSketchStateChange={(sketchCardId, s) =>
                                            sketch.saveSketchDebounced(viewTid, sketchCardId, s)
                                        }
                                        onMarkDone={() => {
                                            setProgress((p: any) => {
                                                const next = buildMarkCardDoneProgress(p, viewTid, card);
                                                queueMicrotask(() => {
                                                    flushNow(next);
                                                    scrollToNextActionable(cardIndex, next);
                                                });
                                                return next;
                                            });
                                        }}
                                        onQuizPass={(quizId) => {
                                            setProgress((p: any) => {
                                                const next = buildQuizPassProgress(p, viewTid, quizId);
                                                queueMicrotask(() => {
                                                    flushNow(next);
                                                    scrollToNextActionable(cardIndex, next);
                                                });
                                                return next;
                                            });
                                        }}
                                        onQuizStateChange={(quizCardId, s) => {
                                            setProgress((p: any) =>
                                                buildQuizStateProgress(p, viewTid, quizCardId, s),
                                            );
                                        }}
                                        onQuizReset={(quizCardId) => {
                                            setProgress((p: any) => {
                                                const next = buildQuizResetProgress(p, viewTid, quizCardId);
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