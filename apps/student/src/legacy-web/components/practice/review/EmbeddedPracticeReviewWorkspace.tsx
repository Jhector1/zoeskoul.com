"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import SummaryView from "@/components/practice/shell/SummaryView";
import StandaloneReviewExerciseFlow from "./StandaloneReviewExerciseFlow";
import ReviewModuleLayout from "@/components/review/module/components/layout/ReviewModuleLayout";
import ReviewModuleHeader from "@/components/review/module/components/layout/ReviewModuleHeader";
import TopicShell from "@/components/review/module/components/TopicShell";
import { useReduceMotion } from "@/components/review/module/hooks/useReduceMotion";
import { useGamificationSummary } from "@/components/review/module/hooks/useGamificationSummary";
import type {
  EmbeddedPracticeWorkspacePresentation,
} from "@/lib/practice/experience/embeddedWorkspace";

function safeReturnHref(props: PracticeShellProps) {
  const locale = props.locale || "en";
  const raw = String(props.returnUrl ?? "").trim();
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;

  if (props.subjectSlug && props.moduleSlug) {
    return `/${locale}/subjects/${encodeURIComponent(props.subjectSlug)}/modules/${encodeURIComponent(props.moduleSlug)}`;
  }

  return `/${locale}/subjects`;
}

export default function EmbeddedPracticeReviewWorkspace({
  props,
  presentation,
}: {
  props: PracticeShellProps;
  presentation: EmbeddedPracticeWorkspacePresentation;
}) {
  const t = useTranslations("Practice.workspace");
  const reduceMotion = useReduceMotion();
  const { summary: gamificationSummary } = useGamificationSummary();
  const headerGamification = gamificationSummary
    ? {
        totalXp: gamificationSummary.totalXp,
        level: gamificationSummary.level,
        currentStreak: gamificationSummary.currentStreak,
        levelProgressPct: gamificationSummary.levelProgressPct,
      }
    : null;

  const copy = presentation.copy;
  const progress = t("stage.questionProgress", {
    current: Math.min(props.idx + 1, Math.max(1, props.sessionSize)),
    total: Math.max(1, props.sessionSize),
  });
  const title =
    props.phase === "summary"
      ? t(copy.completeTitle)
      : props.exercise?.title || t(copy.title);
  const subtitle =
    props.phase === "summary"
      ? t(copy.completeSubtitle, {
          correct: props.correctCount,
          answered: props.answeredCount,
        })
      : [t(copy.kicker), progress, props.exercise?.topic]
          .filter(Boolean)
          .join(" • ");

  return (
    <div
      className="h-dvh min-h-0 w-full overflow-hidden"
      data-testid={presentation.testId}
      data-experience-mode={presentation.mode}
    >
      <ReviewModuleLayout
        ariaBusy={props.busy}
        reduceMotion={reduceMotion}
        showMask={false}
        showSkeleton={false}
        isNavigating={false}
        leftCollapsed
        rightCollapsed
        leftW={0}
        rightW={0}
        header={
          <ReviewModuleHeader
            locale={props.locale || "en"}
            toolsUiEnabled={false}
            toolsToggleAllowed={false}
            topicsToggleAllowed={false}
            showDesktopLeft={false}
            showDesktopRight={false}
            leftCollapsed
            rightCollapsed
            modulesHref={safeReturnHref(props)}
            showModulesButton
            modulesButtonLabel={t(copy.returnLabel)}
            modulesButtonTitle={t(copy.returnTitle)}
            modulesButtonLoadingText={t(copy.returnLoading)}
            showResetButton={false}
            onToggleLeftPanel={() => undefined}
            onToggleRightPanel={() => undefined}
            resetOptions={[]}
            onPrevTopic={props.canGoPrev ? props.goPrev : undefined}
            onNextTopic={props.canGoNext ? () => void props.goNext() : undefined}
            prevTopic={props.canGoPrev ? { id: "previous" } : null}
            nextTopic={props.canGoNext ? { id: "next" } : null}
            unlockAll
            viewIsComplete
            headerGamification={headerGamification}
            saveStatus={props.busy || props.submitBusy ? "saving" : "saved"}
            lastSaveError={props.actionErr}
          />
        }
        body={
          <main className="min-h-0 min-w-0 flex-1 overflow-auto">
            <div className="mx-auto min-h-full w-full max-w-[76rem] px-0 sm:px-3 lg:px-4">
              <TopicShell title={title} subtitle={subtitle}>
                <div className="flex min-h-full flex-col pb-12">
                  {props.phase === "summary" ? (
                    <SummaryView {...props} layoutMode="embedded" />
                  ) : (
                    <StandaloneReviewExerciseFlow
                      props={props}
                      surface="embedded"
                    />
                  )}
                </div>
              </TopicShell>
            </div>
          </main>
        }
      />
    </div>
  );
}
