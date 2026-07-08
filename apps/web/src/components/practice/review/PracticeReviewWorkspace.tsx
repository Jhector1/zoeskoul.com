"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import SummaryView from "@/components/practice/shell/SummaryView";
import PracticeNavigator from "./PracticeNavigator";
import PracticeCompletionCelebration from "@/components/practice/completion/PracticeCompletionCelebration";
import { resolvePracticeDisplayStack } from "@/lib/practice/experience/reviewDisplayStack";
import StandaloneReviewExerciseFlow from "./StandaloneReviewExerciseFlow";

import ReviewModuleLayout from "@/components/review/module/components/layout/ReviewModuleLayout";
import ReviewModuleHeader from "@/components/review/module/components/layout/ReviewModuleHeader";
import ReviewModuleRightRail from "@/components/review/module/components/layout/ReviewModuleRightRail";
import ReviewModuleStackedTools from "@/components/review/module/components/layout/ReviewModuleStackedTools";
import MobileDrawer from "@/components/review/module/components/layout/MobileDrawer";
import TopicShell from "@/components/review/module/components/TopicShell";
import FlowNavigator from "@/components/review/navigation/FlowNavigator";

import { useReviewPanels } from "@/components/review/module/hooks/useReviewPanels";
import { useReduceMotion } from "@/components/review/module/hooks/useReduceMotion";
import { useGamificationSummary } from "@/components/review/module/hooks/useGamificationSummary";
import { useStandalonePracticeTools } from "@/components/practice/tools/useStandalonePracticeTools";
import { ExerciseToolsProvider } from "@/components/tools/context/ExerciseToolsContext";
import { resolveStablePracticeExerciseId } from "@/lib/practice/exerciseIdentity";
import { cn } from "@/lib/cn";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function safeReturnHref(props: PracticeShellProps) {
  const locale = props.locale || "en";
  const raw = String(props.returnUrl ?? "").trim();

  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;

  if (props.subjectSlug && props.moduleSlug) {
    return `/${locale}/subjects/${encodeURIComponent(props.subjectSlug)}/modules/${encodeURIComponent(props.moduleSlug)}`;
  }

  return `/${locale}/subjects`;
}

function stageCopy(
  props: PracticeShellProps,
  t: ReturnType<typeof useTranslations>,
) {
  if (props.phase === "summary") {
    return {
      title: t("stage.completeTitle"),
      subtitle: t("stage.completeSubtitle", {
        correct: props.correctCount,
        answered: props.answeredCount,
      }),
    };
  }

  if (props.experienceMode === "public_challenge") {
    return {
      title:
        props.challengeTitle ||
        props.exercise?.title ||
        t("stage.challengeDefaultTitle"),
      subtitle:
        props.exercise?.topic || t("stage.challengeDefaultSubtitle"),
    };
  }

  if (props.experienceMode === "daily_five") {
    return {
      title: props.exercise?.title || t("stage.dailyDefaultTitle"),
      subtitle: props.exercise?.topic || t("stage.dailyDefaultSubtitle"),
    };
  }

  return {
    title: props.exercise?.title || t("stage.practiceDefaultTitle"),
    subtitle: props.exercise?.topic || t("stage.practiceDefaultSubtitle"),
  };
}

function PracticeLeftRail({
  show,
  collapsed,
  width,
  padStyle,
  onResizeStart,
  children,
}: {
  show: boolean;
  collapsed: boolean;
  width: number;
  padStyle: React.CSSProperties;
  onResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("Practice.workspace");
  if (!show) return null;

  return (
    <>
      <aside
        className={cn(
          "h-full min-h-0 shrink-0 overflow-hidden transition-[width] duration-300 ease-out",
          collapsed && "w-0",
        )}
        style={{ width: collapsed ? 0 : width }}
      >
        <div
          className="h-full min-h-0 overflow-auto overscroll-contain [scrollbar-gutter:stable]"
          style={padStyle}
          data-testid="practice-navigator-scroll-region"
        >
          {children}
        </div>
      </aside>
      {!collapsed ? (
        <div
          onMouseDown={onResizeStart}
          className="w-2 shrink-0 cursor-col-resize rounded-xl bg-neutral-200/60 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10"
          title={t("header.resizeNavigator")}
        />
      ) : null}
    </>
  );
}

function PracticeStage({
  props,
  reduceMotion,
  showMobileWorkspaceTabs,
  mobileToolsPanel,
}: {
  props: PracticeShellProps;
  reduceMotion: boolean;
  showMobileWorkspaceTabs: boolean;
  mobileToolsPanel: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<"lesson" | "code">("lesson");
  const t = useTranslations("Practice.workspace");
  const copy = stageCopy(props, t);
  const slots = useMemo(
    () =>
      Array.from({ length: Math.max(1, props.sessionSize) }, (_, index) => ({
        index,
      })),
    [props.sessionSize],
  );

  const exerciseCard = (
    <StandaloneReviewExerciseFlow props={props} surface="tools" />
  );

  const lessonContent = (
    <TopicShell title={copy.title} subtitle={copy.subtitle}>
      <div className="flex min-h-full flex-col pb-28">
        {props.phase === "summary" ? (
          <SummaryView {...props} layoutMode="embedded" />
        ) : (
          <FlowNavigator
            items={slots}
            mode="slideshow"
            activeIndex={props.idx}
            onActiveIndexChange={(index) => {
              if (index < props.stack.length) props.setIdx(index);
            }}
            reduceMotion={reduceMotion}
            getKey={(slot) => `practice-slot-${slot.index}`}
            getProgressLabel={(index, total) =>
              t("stage.questionProgress", { current: index + 1, total })
            }
            canGoPrev={props.canGoPrev}
            canGoNext={props.canGoNext}
            onPrev={props.goPrev}
            onNext={() => {
              void props.goNext();
            }}
            renderItem={() => exerciseCard}
          />
        )}
      </div>
    </TopicShell>
  );

  if (showMobileWorkspaceTabs) {
    return (
      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 w-full flex-col">
          <div className="shrink-0 border-b border-[rgb(var(--ui-border)/0.75)] bg-[rgb(var(--ui-surface)/0.94)] p-3 backdrop-blur">
            <div
              className="mx-auto grid max-w-xl grid-cols-2 rounded-full bg-[rgb(var(--ui-muted)/0.7)] p-1 text-sm font-black"
              role="tablist"
              aria-label={t("stage.tabsAria")}
              data-testid="practice-mobile-workspace-tabs"
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
                {t("exerciseTab")}
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
                {t("codeTab")}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <section
              className={cn("h-full min-h-0 overflow-auto", activeTab !== "lesson" && "hidden")}
              role="tabpanel"
              aria-hidden={activeTab !== "lesson"}
            >
              {lessonContent}
            </section>
            <section
              className={cn("h-full min-h-0 overflow-hidden", activeTab !== "code" && "hidden")}
              role="tabpanel"
              aria-hidden={activeTab !== "code"}
            >
              {mobileToolsPanel}
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-auto">
      {lessonContent}
    </main>
  );
}

export default function PracticeReviewWorkspace(props: PracticeShellProps) {
  const t = useTranslations("Practice.workspace");
  const reduceMotion = useReduceMotion();
  const panels = useReviewPanels({
    shouldDefaultCollapseRightRail: false,
    rightRailDefaultScopeKey: resolveStablePracticeExerciseId({
      item: props.current,
      exercise: props.exercise,
      fallbackIndex: props.idx,
    }),
    allowDesktopRightRail: true,
  });
  const { summary: gamificationSummary } = useGamificationSummary();
  const resetExerciseToStarter = useReviewRuntimeStore(
    (state) => state.resetExerciseToStarter,
  );
  const [completionOpen, setCompletionOpen] = useState(false);
  const completionShownRef = useRef(false);
  const completionStack = useMemo(
    () =>
      resolvePracticeDisplayStack({
        stack: props.stack,
        reviewStack: props.reviewStack,
        answeredCount: props.answeredCount,
      }),
    [props.answeredCount, props.reviewStack, props.stack],
  );
  const revealedCount = useMemo(
    () =>
      completionStack.filter((item) =>
        Boolean(
          item?.revealed ||
            (item?.result as any)?.revealUsed ||
            (item?.result as any)?.revealAnswer,
        ),
      ).length,
    [completionStack],
  );

  useEffect(() => {
    if (props.phase !== "summary") {
      completionShownRef.current = false;
      setCompletionOpen(false);
      return;
    }

    if (props.experienceMode !== "daily_five") return;
    if (completionShownRef.current) return;

    completionShownRef.current = true;
    setCompletionOpen(true);
  }, [props.experienceMode, props.phase]);

  const tools = useStandalonePracticeTools({
    props,
    rightCollapsed: panels.rightCollapsedEff,
    rightW: panels.rightW,
    onCollapse: panels.handleCollapseRight,
    onEnsureVisible: () => {
      if (panels.showDesktopRight) {
        panels.setRightCollapsed(false);
      }
    },
  });

  const headerGamification = gamificationSummary
    ? {
        totalXp: gamificationSummary.totalXp,
        level: gamificationSummary.level,
        currentStreak: gamificationSummary.currentStreak,
        levelProgressPct: gamificationSummary.levelProgressPct,
      }
    : null;

  const handleResetCurrentExercise = useCallback(() => {
    if (!props.exercise || !props.current) return;

    resetExerciseToStarter({
      topicId: firstText(props.exercise.topic, props.topic, "all"),
      cardId: tools.cardId,
      exerciseId: tools.exerciseId,
      exerciseStateKey: tools.exerciseStateKey,
    });

    void props.resetCurrentExercise?.();
  }, [
    props.current,
    props.exercise,
    props.resetCurrentExercise,
    props.topic,
    resetExerciseToStarter,
    tools.cardId,
    tools.exerciseId,
    tools.exerciseStateKey,
  ]);

  const navigator = (
    <PracticeNavigator
      {...props}
      onResetCurrentExercise={handleResetCurrentExercise}
    />
  );
  const mobileToolsPanel = (
    <ReviewModuleStackedTools
      showDesktopRight={panels.showDesktopRight}
      rightCollapsed={panels.rightCollapsedEff}
      shouldRenderStackedTools
      displayMode="tab"
      toolsPanelProps={tools.panelProps}
    />
  );

  const page = (
    <ReviewModuleLayout
      ariaBusy={props.busy}
      reduceMotion={reduceMotion}
      showMask={false}
      showSkeleton={false}
      isNavigating={false}
      leftCollapsed={panels.leftCollapsedEff}
      rightCollapsed={panels.rightCollapsedEff}
      leftW={panels.leftW}
      rightW={panels.rightW}
      header={
        <ReviewModuleHeader
          locale={props.locale || "en"}
          toolsUiEnabled
          toolsToggleAllowed={panels.showDesktopRight}
          showDesktopLeft={panels.showDesktopLeft}
          showDesktopRight={panels.showDesktopRight}
          leftCollapsed={panels.leftCollapsedEff}
          rightCollapsed={panels.rightCollapsedEff}
          modulesHref={safeReturnHref(props)}
          showModulesButton={false}
          showResetButton={false}
          onToggleLeftPanel={panels.handleToggleLeftPanel}
          onToggleRightPanel={() => {
            if (panels.showDesktopRight) panels.handleToggleRightPanel();
          }}
          resetOptions={[
            {
              id: "restart-practice",
              label: t("header.restartTitle"),
              description: t("header.restartDescription"),
              onSelect: () => {
                void props.restartPractice?.();
              },
            },
          ]}
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
      leftRail={
        <PracticeLeftRail
          show={panels.showDesktopLeft}
          collapsed={panels.leftCollapsedEff}
          width={panels.leftW}
          padStyle={panels.padStyle}
          onResizeStart={panels.onMouseDownLeftHandle}
        >
          {navigator}
        </PracticeLeftRail>
      }
      rightRail={
        <ReviewModuleRightRail
          showDesktopRight={panels.showDesktopRight}
          rightCollapsed={panels.rightCollapsedEff}
          rightW={panels.rightW}
          onResizeStart={panels.onMouseDownRightHandle}
          toolsPanelProps={tools.panelProps}
        />
      }
      mobileDrawer={
        <MobileDrawer
          open={panels.mobileTopicsOpen}
          side="left"
          title={t("header.navigatorDrawerTitle")}
          reduceMotion={reduceMotion}
          onClose={() => panels.setMobileTopicsOpen(false)}
        >
          <div className="p-3" style={panels.padStyle}>
            {navigator}
          </div>
        </MobileDrawer>
      }
      body={
        <PracticeStage
          props={props}
          reduceMotion={reduceMotion}
          showMobileWorkspaceTabs={!panels.showDesktopRight}
          mobileToolsPanel={mobileToolsPanel}
        />
      }
    />
  );

  return (
    <ExerciseToolsProvider {...tools.providerProps}>
      <div
        className="h-dvh min-h-0 w-full overflow-hidden"
        data-testid="practice-review-workspace-viewport"
      >
        {page}
      </div>
      <PracticeCompletionCelebration
        open={completionOpen}
        reduceMotion={reduceMotion}
        experienceMode={props.experienceMode}
        viewer={props.viewer}
        answeredCount={props.answeredCount}
        correctCount={props.correctCount}
        revealedCount={revealedCount}
        targetCount={props.sessionSize}
        dailyResetAt={props.dailyResetAt}
        leaderboardUrl={props.leaderboardUrl}
        onPrimary={() => props.onReturn?.()}
        onClose={() => setCompletionOpen(false)}
      />
    </ExerciseToolsProvider>
  );
}
