"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

import CourseCompleteConfetti from "@/components/review/module/components/CourseCompleteConfetti";
import type {
  PracticeExperienceMode,
  PracticeRunViewer,
} from "@/lib/practice/experience/types";
import { resolvePracticeCompletionIntent } from "@/lib/practice/experience/completion";
import DailyResetCountdown from "@/components/practice/completion/DailyResetCountdown";

export default function PracticeCompletionCelebration(props: {
  open: boolean;
  reduceMotion: boolean;
  experienceMode: PracticeExperienceMode;
  viewer: PracticeRunViewer;
  answeredCount: number;
  correctCount: number;
  revealedCount?: number;
  targetCount: number;
  dailyResetAt?: string | null;
  leaderboardUrl?: string | null;
  onPrimary: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("Practice.completion");
  const intent = resolvePracticeCompletionIntent({
    mode: props.experienceMode,
    viewer: props.viewer,
  });

  const isDaily = props.experienceMode === "daily_five";
  const primaryLabel =
    intent === "daily_free"
      ? t("daily.freePrimary")
      : intent === "daily_subscriber"
        ? t("daily.subscriberPrimary")
        : t("defaultPrimary");

  return (
    <>
      <CourseCompleteConfetti
        open={props.open}
        reduceMotion={props.reduceMotion}
        burstKey={`${props.experienceMode}:${props.answeredCount}:${props.correctCount}`}
        count={88}
      />

      <AnimatePresence>
        {props.open ? (
          <motion.div
            key="practice-completion-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={props.reduceMotion ? { duration: 0 } : { duration: 0.2 }}
            className="fixed inset-0 z-[96] flex items-center justify-center bg-black/45 p-4"
          >
            <motion.div
              initial={
                props.reduceMotion
                  ? false
                  : { opacity: 0, y: 20, scale: 0.96, filter: "blur(8px)" }
              }
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={
                props.reduceMotion
                  ? undefined
                  : { opacity: 0, y: 12, scale: 0.98, filter: "blur(6px)" }
              }
              transition={
                props.reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 320, damping: 28, mass: 0.95 }
              }
              className="w-full max-w-lg"
            >
              <div
                className="ui-celebrate-card ui-celebrate-card-success rounded-3xl p-6 shadow-[var(--ui-shadow-lg)] backdrop-blur"
                style={{
                  backgroundColor: "rgb(var(--ui-surface) / 0.985)",
                  border: "1px solid rgb(var(--ui-accent) / 0.22)",
                  boxShadow:
                    "0 0 0 1px rgb(var(--ui-accent) / 0.08), var(--ui-shadow-lg)",
                }}
              >
                <div className="flex items-start gap-4 pl-2">
                  <div className="ui-celebrate-icon ui-celebrate-icon-success" aria-hidden>
                    ✓
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="ui-celebrate-kicker">
                      {isDaily ? t("daily.kicker") : t("kicker")}
                    </div>
                    <div className="mt-1 text-xl font-semibold tracking-tight text-[rgb(var(--ui-text)/0.98)]">
                      {isDaily ? t("daily.title") : t("title")}
                    </div>
                    <div className="ui-celebrate-copy">
                      {t("score", {
                        correct: props.correctCount,
                        total: props.targetCount,
                      })}
                    </div>

                    {isDaily && (props.revealedCount ?? 0) > 0 ? (
                      <div className="mt-2 text-sm font-semibold text-[rgb(var(--ui-text-muted)/0.92)]">
                        {t("daily.revealedNote", {
                          count: props.revealedCount ?? 0,
                        })}
                      </div>
                    ) : null}

                    <div className="ui-celebrate-note ui-celebrate-note-success">
                      {intent === "daily_free"
                        ? t("daily.freeNote")
                        : intent === "daily_subscriber"
                          ? t("daily.subscriberNote")
                          : t("defaultNote")}
                    </div>

                    {isDaily ? (
                      <DailyResetCountdown nextResetAt={props.dailyResetAt} />
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={props.onPrimary}
                        className="ui-btn ui-btn-primary"
                      >
                        {primaryLabel}
                      </button>

                      {props.leaderboardUrl ? (
                        <a
                          href={props.leaderboardUrl}
                          className="ui-btn ui-btn-secondary"
                        >
                          {t("leaderboard")}
                        </a>
                      ) : null}

                      <button
                        type="button"
                        onClick={props.onClose}
                        className="ui-btn ui-btn-secondary"
                      >
                        {t("reviewResults")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
