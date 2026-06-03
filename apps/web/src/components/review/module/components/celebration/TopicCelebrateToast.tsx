"use client";

import React from "react";
import { motion } from "framer-motion";
import type { TopicCelebrateToast as TopicCelebrateToastVm } from "../../hooks/useReviewCelebrations";

const TOPIC_TOAST_ANIM = {
    initial: { opacity: 0, y: 18, scale: 0.98, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, y: 10, scale: 0.985, filter: "blur(4px)" },
};

const TOPIC_TOAST_TRANSITION = {
    type: "spring",
    stiffness: 360,
    damping: 30,
    mass: 0.9,
} as const;

type Props = {
    reduceMotion: boolean;
    toast: TopicCelebrateToastVm;
    onPauseChange: (paused: boolean) => void;
    onDismiss: () => void;
};

export default function TopicCelebrateToast({
                                                reduceMotion,
                                                toast,
                                                onPauseChange,
                                                onDismiss,
                                            }: Props) {
    return (
        <motion.div
            key={toast.id}
            initial={reduceMotion ? false : TOPIC_TOAST_ANIM.initial}
            animate={TOPIC_TOAST_ANIM.animate}
            exit={reduceMotion ? undefined : TOPIC_TOAST_ANIM.exit}
            transition={reduceMotion ? { duration: 0 } : TOPIC_TOAST_TRANSITION}
            className="fixed bottom-4 right-4 z-[80] w-[min(92vw,390px)]"
            onMouseEnter={() => onPauseChange(true)}
            onMouseLeave={() => onPauseChange(false)}
        >
            <div
                className="ui-celebrate-card ui-celebrate-card-success rounded-2xl p-4 shadow-[var(--ui-shadow-lg)] backdrop-blur"
                style={{
                    backgroundColor: "rgb(var(--ui-surface) / 0.98)",
                    border: "1px solid rgb(var(--ui-accent) / 0.22)",
                    boxShadow: "0 0 0 1px rgb(var(--ui-accent) / 0.08), var(--ui-shadow-lg)",
                }}
            >
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss progress saved message"
                    className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[rgb(var(--ui-text-muted)/0.8)] transition hover:bg-[rgb(var(--ui-accent)/0.1)] hover:text-[rgb(var(--ui-text)/0.96)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ui-accent)/0.28)]"
                >
                    <span aria-hidden>x</span>
                </button>

                <div className="flex items-start gap-3 pl-2 pr-10">
                    <div className="ui-celebrate-icon ui-celebrate-icon-success" aria-hidden>
                        ✓
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="ui-celebrate-kicker">Progress saved</div>

                        <div className="mt-1 text-sm font-semibold tracking-tight text-[rgb(var(--ui-text)/0.99)]">
                            {toast.title}
                        </div>

                        <div className="ui-celebrate-copy">
                            {toast.message}
                        </div>

                        {(toast.streak || toast.xp) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {toast.streak ? (
                                    <span className="ui-celebrate-badge ui-celebrate-badge-success">
                                        🔥 {toast.streak} streak
                                    </span>
                                ) : null}

                                {toast.xp ? (
                                    <span className="ui-celebrate-badge ui-celebrate-badge-success">
                                        +{toast.xp} XP
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
