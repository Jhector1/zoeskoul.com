import React, { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";

import type { ReviewProgressState } from "@/lib/subjects/progressTypes";

import { ROUTES } from "@/utils";

import { useReviewProgress } from "@/components/review/module/hooks/useReviewProgress";
import { useAssignmentStatus } from "@/components/review/module/hooks/useAssignmentStatus";
import { useModuleNav } from "@/components/review/module/hooks/useModuleNav";
import { useDebouncedSketchState } from "../hooks/useDebouncedSketchState";
import { useToolCodeRunnerState } from "../hooks/useToolCodeRunnerState";
import { useSkeletonGate } from "@/components/review/module/hooks/useSkeletonGate";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { useSubjectFinish } from "../hooks/useSubjectFinish";
import { useGamificationSummary } from "@/components/review/module/hooks/useGamificationSummary";

import { useReviewModuleRuntime } from "./useReviewModuleRuntime";
import { useReviewTopicFlow } from "./useReviewTopicFlow";
import { useReviewCelebrations } from "./useReviewCelebrations";
import { useReviewReset } from "./useReviewReset";
import { useReviewScrollSync } from "./useReviewScrollSync";
import { useReviewPanels } from "./useReviewPanels";

import { prereqsMetForAnyQuizOrProject, isTopicComplete } from "../utils";
import {
    getModuleProgress,
    getSidebarTopicItems,
    getViewCards,
    getViewTopic,
    moduleCompleteFromProgress,
} from "../selectors";
import {
    buildModuleCompletedProgress,
    buildNormalizedTopicsProgress,
    buildTopicCompletedProgress,
} from "../actions";

import {
    STUDENTS_INITIAL_TABLE_SNAPSHOTS,
    STUDENTS_SQL_SCHEMA,
    STUDENTS_SQL_SEED,
} from "../data/studentsSqlFallback";

import type { ReviewModulePageProps, HeaderGamificationVm } from "../types";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { getCardStateKey } from "../runtime/exerciseKeys";

export function useReviewModuleController({
                                              mod,
                                              onModuleCompleteChange,
                                              canUnlockAll = false,
                                              footerInsetPx = 0,
                                              navigationMode,
                                          }: ReviewModulePageProps) {
    const params = useParams<{ locale: string; subjectSlug: string; moduleSlug: string }>();
    const router = useRouter();

    const locale = params?.locale ?? "en";
    const subjectSlug = params?.subjectSlug ?? "";
    const moduleSlug = params?.moduleSlug ?? "";
    const sectionSlug = (params as any)?.sectionSlug;
    const unlockAll = Boolean(canUnlockAll);

    const resolvedNavModes = useMemo(() => {
        const { resolveFlowNavigationConfig } = require("@/components/review/navigation/FlowNavigator");
        return resolveFlowNavigationConfig(navigationMode);
    }, [navigationMode]);

    const topics = Array.isArray(mod?.topics) ? mod.topics : [];
    const firstTopicId = topics[0]?.id ?? "";

    const {
        hydrated: progressHydrated,
        progress,
        setProgress,
        activeTopicId,
        setActiveTopicId,
        viewTopicId,
        setViewTopicId,
        flushNow,
    } = useReviewProgress({ subjectSlug, moduleSlug, locale, firstTopicId });

    const store = useReviewRuntimeStore();

    const flushAll = useCallback(async () => {
        store.flushBeforeNavigation({
            flushProgress: () => {
                void flushNow(progress);
            }
        });
    }, [store, flushNow, progress]);

    const viewTopic = useMemo(
        () => getViewTopic(topics, viewTopicId),
        [topics, viewTopicId],
    );

    const viewCards = useMemo(
        () => getViewCards(viewTopic),
        [viewTopic],
    );

    const viewTid = viewTopic?.id ?? firstTopicId ?? "";

    const runtime = useReviewModuleRuntime({
        subjectSlug,
        mod,
        viewTopic,
    });

    const panels = useReviewPanels({ footerInsetPx });

    const sketch = useDebouncedSketchState({});

    useEffect(() => {
        if (!progressHydrated) return;
        if (!topics.length) return;

        const { changed, nextTopics } = buildNormalizedTopicsProgress(topics, progress ?? null);
        if (!changed) return;

        const next: ReviewProgressState = {
            ...(progress ?? {}),
            topics: nextTopics,
        };

        setProgress(next);
        flushNow(next);
    }, [progressHydrated, topics, progress, setProgress, flushNow]);

    const moduleComplete = useMemo(
        () => moduleCompleteFromProgress(progress, topics),
        [progress, topics],
    );

    const subjectFinish = useSubjectFinish({
        subjectSlug,
        moduleSlug,
        enabled: Boolean(subjectSlug && moduleSlug),
        refreshKey:
            progressHydrated &&
            `${subjectSlug}:${moduleSlug}:${String(moduleCompleteFromProgress(progress, topics))}:${String(
                (progress as any)?.moduleCompleted,
            )}`,
    });

    useEffect(() => {
        onModuleCompleteChange?.(moduleComplete || Boolean((progress as any)?.moduleCompleted));
    }, [moduleComplete, progress, onModuleCompleteChange]);

    useEffect(() => {
        if (!progressHydrated) return;
        if (!moduleComplete) return;
        if ((progress as any)?.moduleCompleted) return;

        const nowIso = new Date().toISOString();
        const next = buildModuleCompletedProgress(progress, nowIso);
        setProgress(next);
        flushNow(next);
    }, [moduleComplete, progressHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!progressHydrated) return;
        if (!viewTid) return;

        const doneNow = isTopicComplete(
            viewCards,
            (progress as any)?.topics?.[viewTid],
            viewTid,
        );
        if (!doneNow) return;

        const tp: any = (progress as any)?.topics?.[viewTid] ?? {};
        if (tp.completed) return;

        const nowIso = new Date().toISOString();
        setProgress((p: any) => buildTopicCompletedProgress(p, viewTid, nowIso));
    }, [progressHydrated, viewTid, viewCards, progress, setProgress]);

    const assignmentSessionId = (progress as any)?.assignmentSessionId
        ? String((progress as any).assignmentSessionId)
        : null;
    const assignmentStatusEnabled = progressHydrated && Boolean(assignmentSessionId);

    const {
        status: assignmentStatus,
        rightPct: assignmentRightPct,
        missedPct: assignmentMissedPct,
    } = useAssignmentStatus({
        sessionId: assignmentSessionId,
        enabled: assignmentStatusEnabled,
        subject: subjectSlug,
        module: moduleSlug,
    });

    const assignmentLabel =
        assignmentStatus.phase === "complete"
            ? "✓ Assignment complete"
            : assignmentStatus.phase === "in_progress"
                ? "Assignment in progress"
                : "Start module assignment";

    const assignmentSublabel =
        assignmentStatus.phase === "in_progress"
            ? `${assignmentStatus.answeredCount}/${assignmentStatus.targetCount} questions`
            : assignmentStatus.phase === "complete"
                ? `${assignmentStatus.answeredCount}/${assignmentStatus.targetCount} questions`
                : undefined;

    const nav = useModuleNav({ subjectSlug, moduleSlug });

    const canGoNextModule =
        unlockAll ||
        (moduleComplete || Boolean((progress as any)?.moduleCompleted));

    const navLoading = nav === undefined;
    const navError = nav === null;

    const topicFlow = useReviewTopicFlow({
        topics,
        unlockAll,
        progress,
        activeTopicId,
        setActiveTopicId,
        viewTopicId,
        setViewTopicId,
        onBeforeNavigate: flushAll,
    });

    const showSkeleton = useSkeletonGate({
        ready: progressHydrated,
        swapKey: `${subjectSlug}:${moduleSlug}:${locale}`,
        reduceMotion: useReduceMotion(),
        initialMinMs: 240,
        swapMs: 170,
    });

    const reduceMotion = useReduceMotion();
    const [showMask, setShowMask] = useState(false);

    useEffect(() => {
        if (reduceMotion) return;
        if (showSkeleton) {
            setShowMask(false);
            return;
        }

        setShowMask(true);
        const t = window.setTimeout(() => setShowMask(false), 420);
        return () => window.clearTimeout(t);
    }, [showSkeleton, reduceMotion]);

    const topicMotionKey = useMemo(() => {
        const viewProg: any = (progress as any)?.topics?.[viewTid] ?? {};
        const moduleV = (progress as any)?.quizVersion ?? 0;
        const topicV = (viewProg as any)?.quizVersion ?? 0;
        return `${viewTid}:${moduleV}.${topicV}`;
    }, [progress, viewTid]);

    const viewProg: any = (progress as any)?.topics?.[viewTid] ?? {};
    const moduleV = (progress as any)?.quizVersion ?? 0;
    const topicV = (viewProg as any)?.quizVersion ?? 0;
    const versionStr = `${moduleV}.${topicV}`;

    const scrollSync = useReviewScrollSync({
        subjectSlug,
        moduleSlug,
        topicMotionKey,
        viewTid,
        viewCards,
        progress,
        progressHydrated,
        navModes: resolvedNavModes,
        reduceMotion,
        unlockAll,
        showSkeleton,
    });
    const activeCard = viewCards[scrollSync.activeCardIndex] ?? null;
    const [requestedExerciseTarget, setRequestedExerciseTarget] = useState<{
        topicId: string;
        cardId: string;
        exerciseId: string;
        inputId: string;
    } | null>(null);
    const activeExerciseTarget = useMemo(() => {
        if (!requestedExerciseTarget) return null;
        if (requestedExerciseTarget.topicId !== viewTid) return null;

        /**
         * Keep the exercise binding only while its owning card is still active.
         *
         * Without this guard, navigating from a project/exercise card back to a
         * sketch card leaves the right-side IDE scoped to the old exercise.
         * Then the sketch's card workspace never becomes the active tool workspace.
         */
        if (
            activeCard?.id &&
            requestedExerciseTarget.cardId &&
            activeCard.id !== requestedExerciseTarget.cardId
        ) {
            return null;
        }

        return requestedExerciseTarget;
    }, [
        requestedExerciseTarget,
        viewTid,
        activeCard?.id,
    ]);

    const activeCardToolScopeKey = activeCard?.id
        ? `${getCardStateKey({
            subjectSlug,
            moduleSlug,
            sectionSlug,
            topicId: viewTid,
            cardId: activeCard.id,
        })}:general`
        : "general";

    const activeToolScopeKey =
        activeExerciseTarget?.exerciseId ??
        activeCardToolScopeKey;

    const tool = useToolCodeRunnerState({
        progress,
        progressHydrated,
        setProgress,
        viewTid,
        /**
         * Critical:
         * The tool-state hook must hydrate from the active exercise scope
         * when an exercise is active. If this stays on the outer card scope,
         * the last sketch/card editor text can leak into the first exercise.
         */
        scopeKey: activeToolScopeKey,
        defaultLang: runtime.toolDefaults.defaultLang,
        defaultCode: runtime.toolDefaults.defaultCode,
        defaultStdin: runtime.toolDefaults.defaultStdin,
        defaultSqlDialect: runtime.toolDefaults.defaultSqlDialect,
        rightCollapsed: panels.rightCollapsed,
        rightW: panels.rightW,
    });
    useEffect(() => {
        if (!requestedExerciseTarget) return;
        if (!activeCard?.id) return;

        if (
            requestedExerciseTarget.topicId === viewTid &&
            requestedExerciseTarget.cardId !== activeCard.id
        ) {
            setRequestedExerciseTarget(null);
            tool.unbindCodeInput();
        }
    }, [
        requestedExerciseTarget,
        activeCard?.id,
        viewTid,
        tool.unbindCodeInput,
    ]);
    const prereqsForAllQuizzes = unlockAll
        ? true
        : prereqsMetForAnyQuizOrProject(viewCards, viewProg, viewTid);

    const moduleProgress = useMemo(
        () => getModuleProgress(topics, progress),
        [topics, progress],
    );

    const { summary: gamificationSummary } = useGamificationSummary();

    const headerGamification = useMemo<HeaderGamificationVm | null>(() => {
        if (!gamificationSummary) return null;

        return {
            totalXp: gamificationSummary.totalXp,
            level: gamificationSummary.level,
            currentStreak: gamificationSummary.currentStreak,
            levelProgressPct: gamificationSummary.levelProgressPct,
        };
    }, [gamificationSummary]);

    const celebrations = useReviewCelebrations({
        progressHydrated,
        progress,
        topics,
        gamificationSummary,
        subjectFinish,
        mod,
    });

    const resetFlow = useReviewReset({
        topics,
        firstTopicId,
        progress,
        setProgress,
        setActiveTopicId,
        setViewTopicId,
        flushNow,
        toolUnbindCodeInput: tool.unbindCodeInput,
    });

    const handleAssignmentClick = useCallback(async () => {
        const returnToCurrentModule = `/${locale}/${ROUTES.learningPath(
            encodeURIComponent(subjectSlug),
            encodeURIComponent(moduleSlug),
        )}`;

        if (assignmentSessionId && assignmentStatus.phase !== "idle") {
            router.push(
                `/${locale}${ROUTES.practicePath(
                    encodeURIComponent(subjectSlug),
                    encodeURIComponent(moduleSlug),
                )}` +
                `?sessionId=${encodeURIComponent(assignmentSessionId)}` +
                `&returnTo=${encodeURIComponent(returnToCurrentModule)}`,
            );
            return;
        }

        const practiceModuleSlug = (mod as any).practiceSectionSlug ?? moduleSlug;
        const r = await fetch(`/api/modules/${encodeURIComponent(practiceModuleSlug)}/practice/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ returnUrl: returnToCurrentModule }),
        });

        const data = await r.json().catch(() => null);
        if (!r.ok) {
            alert(data?.message ?? "Unable to start.");
            return;
        }

        const newSid = String(data.sessionId);

        const next: ReviewProgressState = {
            ...(progress as any),
            assignmentSessionId: newSid as any,
        };
        setProgress(next);
        flushNow(next);

        router.push(
            `/${locale}${ROUTES.practicePath(
                encodeURIComponent(subjectSlug),
                encodeURIComponent(practiceModuleSlug),
            )}` +
            `?sessionId=${encodeURIComponent(newSid)}` +
            `&returnTo=${encodeURIComponent(returnToCurrentModule)}`,
        );
    }, [
        locale,
        subjectSlug,
        moduleSlug,
        assignmentSessionId,
        assignmentStatus.phase,
        router,
        mod,
        progress,
        setProgress,
        flushNow,
    ]);

    const handleBack = useCallback(() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
        }
        router.push(`/${locale}`);
    }, [router, locale]);

    const nextLocked = Boolean(nav?.nextLocked);
    const nextBillingHref = nav?.nextBillingHref ?? null;

    const goModule = useCallback(
        (mid: string) => {
            router.push(
                `/${locale}${ROUTES.learningPath(
                    encodeURIComponent(subjectSlug),
                    encodeURIComponent(mid),
                )}`,
            );
            router.refresh();
        },
        [router, locale, subjectSlug],
    );

    const goUnlockNext = useCallback(() => {
        router.push(nextBillingHref || "/billing");
        router.refresh();
    }, [router, nextBillingHref]);

    const handleOutroContinue = useCallback(() => {
        if (topicFlow.nextTopic?.id) {
            topicFlow.goNextTopic();
            return;
        }

        if (!nav?.nextModuleId) return;
        if (!canGoNextModule) return;

        if (nextLocked) {
            goUnlockNext();
            return;
        }

        goModule(nav.nextModuleId);
    }, [
        topicFlow.nextTopic?.id,
        topicFlow.goNextTopic,
        nav?.nextModuleId,
        canGoNextModule,
        nextLocked,
        goUnlockNext,
        goModule,
    ]);

    const outroContinueEnabled =
        Boolean(topicFlow.nextTopic?.id) ||
        (Boolean(nav?.nextModuleId) && canGoNextModule);

    const outroContinueLabel = topicFlow.nextTopic?.id
        ? "Next topic"
        : nav?.nextModuleId
            ? nextLocked
                ? "Unlock next"
                : "Next module"
            : "Continue";

    const [isModuleContinuePending, startModuleContinueTransition] = useTransition();

    const handleModuleCelebrateContinue = useCallback(() => {
        if (!outroContinueEnabled) return;
        startModuleContinueTransition(() => {
            handleOutroContinue();
        });
    }, [outroContinueEnabled, startModuleContinueTransition, handleOutroContinue]);

    const handleOpenCertificate = useCallback(() => {
        router.push(`/subjects/${encodeURIComponent(subjectSlug)}/certificate`);
    }, [router, subjectSlug]);

    const handleResetCurrentTopic = useCallback(() => {
        resetFlow.requestResetTopic(viewTid);
    }, [resetFlow, viewTid]);

    const sidebarTopicItems = useMemo(
        () =>
            getSidebarTopicItems({
                topics,
                activeIdx: topicFlow.activeIdx,
                activeTopicId,
                viewTopicId,
                topicUnlocked: topicFlow.topicUnlocked,
                unlockAll,
                progressHydrated,
                progress,
            }),
        [
            topics,
            topicFlow.activeIdx,
            activeTopicId,
            viewTopicId,
            topicFlow.topicUnlocked,
            unlockAll,
            progressHydrated,
            progress,
        ],
    );

    const handleEnsureToolsVisible = useCallback(() => {
        if (panels.rightCollapsed) {
            panels.setRightCollapsed(false);
        }
    }, [panels.rightCollapsed, panels.setRightCollapsed]);

    const handleRun = useCallback(() => {
        void flushAll();
    }, [flushAll]);

    const handleReveal = useCallback(() => {
        void flushAll();
    }, [flushAll]);

    const handleSubmit = useCallback(() => {
        void flushAll();
    }, [flushAll]);

    const handleBindToToolsPanel = useCallback(
        (args: Parameters<typeof tool.bindCodeInput>[0]) => {
            const ownerCardId = args.ownerCardId?.trim() || activeCard?.id || "general";
            const targetExerciseKey = (args as any).exerciseKey ?? args.id;

            const alreadyRequested =
                requestedExerciseTarget?.topicId === viewTid &&
                requestedExerciseTarget?.cardId === ownerCardId &&
                requestedExerciseTarget?.exerciseId === targetExerciseKey &&
                requestedExerciseTarget?.inputId === args.id;

            const actuallyBound = tool.boundId === targetExerciseKey;

            /**
             * Bind is an exercise-navigation event.
             *
             * Do not return only because requestedExerciseTarget matches.
             * The requested target can be set while the actual tool binding is
             * still null/stale, which makes the right rail fall back to :general.
             */
            if (alreadyRequested && actuallyBound) return;

            void tool.flushLatest();

            if (!alreadyRequested) {
                setRequestedExerciseTarget({
                    topicId: viewTid,
                    cardId: ownerCardId,
                    exerciseId: targetExerciseKey,
                    inputId: args.id,
                });
            }

            if (!actuallyBound) {
                tool.bindCodeInput(args as any);
            }
        },
        [
            tool.bindCodeInput,
            tool.flushLatest,
            tool.boundId,
            activeCard?.id,
            viewTid,
            requestedExerciseTarget?.topicId,
            requestedExerciseTarget?.cardId,
            requestedExerciseTarget?.exerciseId,
            requestedExerciseTarget?.inputId,
        ],
    );

    const handleUnbindFromToolsPanel = useCallback(() => {
        void tool.flushLatest();
        setRequestedExerciseTarget(null);
        tool.unbindCodeInput();
    }, [tool.flushLatest, tool.unbindCodeInput]);

    const toolsProvider = useMemo(
        () => ({
            enabled: panels.toolsUiEnabled,
            resetKey: `${viewTid}:${versionStr}`,
            externalBoundId: activeExerciseTarget?.exerciseId ?? null,
            ensureVisible: handleEnsureToolsVisible,
            onBindToToolsPanel: handleBindToToolsPanel,
            onUnbindFromToolsPanel: handleUnbindFromToolsPanel,
        }),
        [
            panels.toolsUiEnabled,
            viewTid,
            versionStr,
            activeExerciseTarget?.exerciseId,
            handleEnsureToolsVisible,
            handleBindToToolsPanel,
            handleUnbindFromToolsPanel,
        ],
    );
    const viewIsComplete = isTopicComplete(
        viewCards,
        (progress as any)?.topics?.[viewTid],
        viewTid,
    );

    /**
     * Exercise navigation happens inside the Exercises card, not through the
     * outer card navigator. During exercise switching, activeExerciseTarget can
     * briefly be null even though useToolCodeRunnerState already has the
     * current bound exercise.
     *
     * The right rail must prefer the real exercise binding when available,
     * otherwise ToolsPanel falls back to `${topic}:general` and the editor
     * shows blank/stale state.
     */
    const rightRailExerciseKey =
        activeExerciseTarget?.exerciseId ??
        tool.boundId ??
        null;

    return {
        toolsProvider,

        layout: {
            ariaBusy: showSkeleton,
            reduceMotion,
            showMask,
            showSkeleton,
            leftCollapsed: panels.leftCollapsedEff,
            rightCollapsed: panels.rightCollapsedEff,
            leftW: panels.leftW,
            rightW: panels.rightW,
        },

        header: {
            locale,
            toolsUiEnabled: panels.toolsUiEnabled,
            showDesktopLeft: panels.showDesktopLeft,
            leftCollapsed: panels.leftCollapsed,
            rightCollapsed: panels.rightCollapsed,
            onBack: handleBack,
            onToggleLeftPanel: panels.handleToggleLeftPanel,
            onToggleRightPanel: panels.handleToggleRightPanel,
            onResetCurrentTopic: handleResetCurrentTopic,
            onPrevTopic: topicFlow.goPrevTopic,
            onNextTopic: topicFlow.goNextTopic,
            prevTopic: topicFlow.prevTopic,
            nextTopic: topicFlow.nextTopic,
            unlockAll,
            viewIsComplete,
            headerGamification,
        },

        leftRail: {
            showDesktopLeft: panels.showDesktopLeft,
            leftCollapsed: panels.leftCollapsed,
            leftW: panels.leftW,
            onResizeStart: panels.onMouseDownLeftHandle,
            padStyle: panels.padStyle,
            sidebarProps: {
                mod,
                topicItems: sidebarTopicItems,
                unlockAll,
                moduleProgress,
                onGoToTopic: topicFlow.goToTopic,
                onResetModule: resetFlow.requestResetModule,
                onCollapse: panels.handleCollapseLeft,
                assignmentPct: assignmentRightPct,
                assignmentMissedPct: assignmentMissedPct,
                assignmentLabel,
                assignmentSublabel,
                onAssignmentClick: handleAssignmentClick,
                hasNextModule: !!nav && !!nav.nextModuleId,
                navLoading,
                navError,
                canGoNextModule,
            },
        },

        rightRail: {
            showDesktopRight: panels.showDesktopRight,
            rightCollapsed: panels.rightCollapsed,
            rightW: panels.rightW,
            onResizeStart: panels.onMouseDownRightHandle,
            toolsPanelProps: {
                onCollapse: panels.handleCollapseRight,
                onUnbind: handleUnbindFromToolsPanel,
                boundId: rightRailExerciseKey,
                toolScopeKey: rightRailExerciseKey
                    ? rightRailExerciseKey
                    : activeToolScopeKey,
                rightBodyRef: tool.rightBodyRef,
                codeRunnerRegionH: tool.codeRunnerRegionH,
                toolHydrated: tool.toolHydrated,
                toolLang: tool.toolLang,
                toolCode: tool.toolCode,
                toolStdin: tool.toolStdin,
                toolWorkspace: tool.toolWorkspace,
                toolSqlDialect: tool.toolSqlDatasetId
                    ? tool.toolSqlDialect
                    : (runtime.topicSqlFallback?.sqlDialect ?? tool.toolSqlDialect),
                ideConfig: tool.toolIdeConfig ?? runtime.effectiveIdeConfig,
                onChangeCode: tool.setToolCode,
                onChangeStdin: tool.setToolStdin,
                onChangeWorkspace: tool.setToolWorkspace,
                onBeforeRun: tool.flushLatest,
                subjectSlug,
                moduleId: moduleSlug,
                locale,
                codeEnabled: runtime.codeEnabled,
                showLanguagePicker: false,
                showSqlDialectPicker: false,
                sqlSchemaSql:
                    tool.toolSqlSchemaSql ??
                    runtime.topicSqlFallback?.sqlSchemaSql ??
                    STUDENTS_SQL_SCHEMA,
                sqlSeedSql:
                    tool.toolSqlSeedSql ??
                    runtime.topicSqlFallback?.sqlSeedSql ??
                    STUDENTS_SQL_SEED,
                sqlInitialTableSnapshots:
                    tool.toolSqlInitialTableSnapshots ??
                    runtime.topicSqlFallback?.sqlInitialTableSnapshots ??
                    STUDENTS_INITIAL_TABLE_SNAPSHOTS,
            },
        },

        mobileDrawer: {
            open: panels.mobileTopicsOpen,
            reduceMotion,
            onClose: () => panels.setMobileTopicsOpen(false),
            padStyle: panels.padStyle,
            sidebarProps: {
                mod,
                topicItems: sidebarTopicItems,
                unlockAll,
                moduleProgress,
                onGoToTopic: (tid: string) => {
                    topicFlow.goToTopic(tid);
                    panels.setMobileTopicsOpen(false);
                },
                onResetModule: resetFlow.requestResetModule,
                onCollapse: () => panels.setMobileTopicsOpen(false),
                assignmentPct: assignmentRightPct,
                assignmentMissedPct: assignmentMissedPct,
                assignmentLabel,
                assignmentSublabel,
                onAssignmentClick: handleAssignmentClick,
                hasNextModule: !!nav && !!nav.nextModuleId,
                navLoading,
                navError,
                canGoNextModule,
            },
        },

        topicStage: {
            leftCollapsedEff: panels.leftCollapsedEff,
            onOpenTopics: panels.handleToggleLeftPanel,
            mainScrollRef: scrollSync.mainScrollRef,
            padStyle: panels.padStyle,
            viewTopic,
            viewCards,
            viewTid,
            activeCardIndex: scrollSync.activeCardIndex,
            navModes: resolvedNavModes,
            reduceMotion,
            tp: viewProg,
            progressHydrated,
            versionStr,
            prereqsForAllQuizzes,
            sketch,
            setProgress,
            flushNow,
            onRun: handleRun,
            onReveal: handleReveal,
            onSubmit: handleSubmit,
            scrollToNextActionable: scrollSync.scrollToNextActionable,
            setCardEl: scrollSync.setCardEl,
            viewIsComplete,
            onContinue: outroContinueEnabled ? handleOutroContinue : undefined,
            continueLabel: outroContinueLabel,
            showSubjectFinish: !topicFlow.nextTopic?.id,
            subjectSlug,
            moduleSlug,
            sectionSlug,
            subjectFinish,
            onOpenCertificate: handleOpenCertificate,
            onActiveCardIndexChange: scrollSync.setActiveCardIndex,
        },

        celebrations: {
            reduceMotion,
            courseCelebrateOpen: celebrations.courseCelebrateOpen,
            setCourseCelebrateOpen: celebrations.setCourseCelebrateOpen,
            courseCelebrateBurstKey: celebrations.courseCelebrateBurstKey,
            courseCelebrateCopy: celebrations.courseCelebrateCopy,
            handleOpenCertificate,
            moduleCelebrateOpen: celebrations.moduleCelebrateOpen,
            setModuleCelebrateOpen: celebrations.setModuleCelebrateOpen,
            moduleCelebrateCopy: celebrations.moduleCelebrateCopy,
            moduleProgress,
            outroContinueEnabled,
            outroContinueLabel,
            isModuleContinuePending,
            onModuleContinue: handleModuleCelebrateContinue,
            topicToast: celebrations.topicToast,
            setTopicToastPaused: celebrations.setTopicToastPaused,
        },

        resetDialog: {
            open: resetFlow.confirmOpen,
            title: resetFlow.pendingStats.title,
            description: resetFlow.pendingStats.description,
            onConfirm: resetFlow.applyPendingChange,
            onClose: resetFlow.cancelPendingChange,
        },
    };
}
