"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { CelebrateCopy } from "../../hooks/useReviewCelebrations";

const MODULE_MODAL_BACKDROP_TRANSITION = {
    duration: 0.2,
    ease: [0.16, 1, 0.3, 1] as const,
};

const MODULE_MODAL_PANEL_ANIM = {
    initial: { opacity: 0, y: 20, scale: 0.96, filter: "blur(8px)" },
    animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, y: 12, scale: 0.98, filter: "blur(6px)" },
};

const MODULE_MODAL_PANEL_TRANSITION = {
    type: "spring",
    stiffness: 320,
    damping: 28,
    mass: 0.95,
} as const;

type Props = {
    reduceMotion: boolean;
    copy: CelebrateCopy;
    moduleProgress: { total: number; done: number; pct: number };
    outroContinueEnabled: boolean;
    outroContinueLabel: string;
    isPending: boolean;
    onContinue: () => void;
    onClose: () => void;
};

export default function ModuleCelebrateModal({
                                                 reduceMotion,
                                                 copy,
                                                 moduleProgress,
                                                 outroContinueEnabled,
                                                 outroContinueLabel,
                                                 isPending,
                                                 onContinue,
                                                 onClose,
                                             }: Props) {
    return (
        <motion.div
            key="module-celebrate-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : MODULE_MODAL_BACKDROP_TRANSITION}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
        >
            <motion.div
                initial={reduceMotion ? false : MODULE_MODAL_PANEL_ANIM.initial}
                animate={MODULE_MODAL_PANEL_ANIM.animate}
                exit={reduceMotion ? undefined : MODULE_MODAL_PANEL_ANIM.exit}
                transition={reduceMotion ? { duration: 0 } : MODULE_MODAL_PANEL_TRANSITION}
                className="w-full max-w-lg"
            >
                <div
                    className="ui-celebrate-card ui-celebrate-card-warn rounded-3xl p-6 shadow-[var(--ui-shadow-lg)] backdrop-blur"
                    style={{
                        backgroundColor: "rgb(var(--ui-surface) / 0.985)",
                        border: "1px solid rgb(var(--ui-warn) / 0.24)",
                        boxShadow: "0 0 0 1px rgb(var(--ui-warn) / 0.08), var(--ui-shadow-lg)",
                    }}
                >                    <div className="flex items-start gap-4 pl-2">
                        <div className="ui-celebrate-icon ui-celebrate-icon-warn" aria-hidden>
                            ★
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="ui-celebrate-kicker">Milestone reached</div>

                            <div className="mt-1 text-xl font-semibold tracking-tight text-[rgb(var(--ui-text)/0.98)]">
                                {copy.title}
                            </div>

                            <div className="ui-celebrate-copy">
                                {copy.body}
                            </div>

                            {copy.streakMilestone ? (
                                <div className="ui-celebrate-note ui-celebrate-note-warn">
                                    {copy.streakMilestone}
                                </div>
                            ) : null}

                            <div className="mt-4 flex flex-wrap gap-2">
                                {copy.streak ? (
                                    <span className="ui-celebrate-badge ui-celebrate-badge-warn">
                                        🔥 {copy.streak} streak
                                    </span>
                                ) : null}

                                {copy.totalXp != null ? (
                                    <span className="ui-celebrate-badge ui-celebrate-badge-warn">
                                        {copy.totalXp.toLocaleString()} XP
                                    </span>
                                ) : null}

                                <span className="ui-celebrate-badge ui-celebrate-badge-warn">
                                    {moduleProgress.done}/{moduleProgress.total} topics
                                </span>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={!outroContinueEnabled || isPending}
                                    onClick={onContinue}
                                    className={cn(
                                        "ui-btn ui-btn-premium",
                                        (!outroContinueEnabled || isPending) &&
                                        "cursor-not-allowed opacity-60",
                                    )}
                                >
                                    {isPending ? (
                                        <span className="inline-flex items-center gap-2">
                                            <span className="ui-quiz-spinner" />
                                            Continuing…
                                        </span>
                                    ) : (
                                        <>
                                            {outroContinueLabel} <span aria-hidden>→</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={onClose}
                                    className={cn(
                                        "ui-btn ui-btn-secondary",
                                        isPending && "cursor-not-allowed opacity-60",
                                    )}
                                >
                                    Review module
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}