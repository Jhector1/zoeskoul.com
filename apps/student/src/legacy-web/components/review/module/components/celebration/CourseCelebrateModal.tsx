"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { CourseCelebrateCopy } from "../../hooks/useReviewCelebrations";

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
    copy: CourseCelebrateCopy;
    onPrimary: () => void;
    onClose: () => void;
};

export default function CourseCelebrateModal({
                                                 reduceMotion,
                                                 copy,
                                                 onPrimary,
                                                 onClose,
                                             }: Props) {
    const t = useTranslations("review.celebration.course");

    return (
        <motion.div
            key="course-celebrate-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : MODULE_MODAL_BACKDROP_TRANSITION}
            className="fixed inset-0 z-[96] flex items-center justify-center bg-black/45 p-4"
        >
            <motion.div
                initial={reduceMotion ? false : MODULE_MODAL_PANEL_ANIM.initial}
                animate={MODULE_MODAL_PANEL_ANIM.animate}
                exit={reduceMotion ? undefined : MODULE_MODAL_PANEL_ANIM.exit}
                transition={reduceMotion ? { duration: 0 } : MODULE_MODAL_PANEL_TRANSITION}
                className="w-full max-w-lg"
            >
                <div
                    className="ui-celebrate-card ui-celebrate-card-success rounded-3xl p-6 shadow-[var(--ui-shadow-lg)] backdrop-blur"
                    style={{
                        backgroundColor: "rgb(var(--ui-surface) / 0.985)",
                        border: "1px solid rgb(var(--ui-accent) / 0.22)",
                        boxShadow: "0 0 0 1px rgb(var(--ui-accent) / 0.08), var(--ui-shadow-lg)",
                    }}
                >
                    <div className="flex items-start gap-4 pl-2">
                        <div className="ui-celebrate-icon ui-celebrate-icon-success" aria-hidden>
                            ✓
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="ui-celebrate-kicker">{t("kicker")}</div>

                            <div className="mt-1 text-xl font-semibold tracking-tight text-[rgb(var(--ui-text)/0.98)]">
                                {copy.title}
                            </div>

                            <div className="ui-celebrate-copy">
                                {copy.body}
                            </div>

                            {copy.streakMilestone ? (
                                <div className="ui-celebrate-note ui-celebrate-note-success">
                                    {copy.streakMilestone}
                                </div>
                            ) : null}

                            <div className="mt-4 flex flex-wrap gap-2">
                                {copy.streak ? (
                                    <span className="ui-celebrate-badge ui-celebrate-badge-success">
                                        🔥 {t("streak", { count: copy.streak })}
                                    </span>
                                ) : null}

                                {copy.totalXp != null ? (
                                    <span className="ui-celebrate-badge ui-celebrate-badge-success">
                                        {t("xp", { count: copy.totalXp.toLocaleString() })}
                                    </span>
                                ) : null}

                                <span className="ui-celebrate-badge ui-celebrate-badge-success">
                                    {t("complete")}
                                </span>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={onPrimary}
                                    className="ui-btn ui-btn-primary"
                                >
                                    {copy.ctaLabel}
                                </button>

                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="ui-btn ui-btn-secondary"
                                >
                                    {t("stayHere")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
