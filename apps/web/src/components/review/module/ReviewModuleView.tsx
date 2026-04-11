"use client";

import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";

import type { ReviewModule, ReviewCard } from "@/lib/subjects/types";
import type { SavedQuizState, ReviewProgressState } from "@/lib/subjects/progressTypes";
import { CodeLanguage } from "@/lib/practice/types";

import { useReviewProgress } from "@/components/review/module/hooks/useReviewProgress";
import { useAssignmentStatus } from "@/components/review/module/hooks/useAssignmentStatus";
import { useModuleNav } from "@/components/review/module/hooks/useModuleNav";

import { ROUTES } from "@/utils";
import { cn } from "@/lib/cn";

import TopicShell from "./components/TopicShell";
import TopicOutro from "./components/TopicOutro";
import ModuleSidebar, { type SidebarTopicItemVm } from "./components/ModuleSidebar";
import ToolsPanel from "@/components/tools/ToolsPanel";

import CardRenderer from "@/components/review/module/CardRenderer";

import {
    countAnswered,
    isTopicComplete,
    clamp01,
    prereqsMetForAnyQuizOrProject,
} from "./utils";
import { useResizablePanels } from "./hooks/useResizablePanels";
import { useDebouncedSketchState } from "./hooks/useDebouncedSketchState";
import { useToolCodeRunnerState } from "./hooks/useToolCodeRunnerState";

import ConfirmResetModal from "@/components/practice/ConfirmResetModal";
import { ReviewToolsProvider } from "@/components/review/module/context/ReviewToolsContext";
import { toolsPolicyForSubject } from "@/lib/tools/policy";

import { AnimatePresence, motion } from "framer-motion";
import ReviewModuleSkeleton from "@/components/review/module/ReviewModuleSkeleton";
import { useSkeletonGate } from "@/components/review/module/hooks/useSkeletonGate";
import HeaderSlick from "@/components/HeaderSlick";
import FlowNavigator, {
    type FlowNavigationConfig,
    resolveFlowNavigationConfig,
} from "@/components/review/navigation/FlowNavigator";
import { resolveToolDefaults } from "@/components/tools/resolveToolDefaults";
import { resolveSqlRunnerConfig } from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";

import MobileDrawer from "./components/layout/MobileDrawer";
import SubjectFinishBanner from "./components/finish/SubjectFinishBanner";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useReduceMotion } from "./hooks/useReduceMotion";
import { useSubjectFinish } from "./hooks/useSubjectFinish";
import {
    STUDENTS_INITIAL_TABLE_SNAPSHOTS,
    STUDENTS_SQL_SCHEMA,
    STUDENTS_SQL_SEED,
} from "./data/studentsSqlFallback";

const TOPIC_PANE_ANIM = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
};

const TOPIC_PANE_TRANSITION = {
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1] as const,
};

export default function ReviewModuleView({
                                             mod,
                                             onModuleCompleteChange,
                                             canUnlockAll = false,
                                             footerInsetPx = 0,
                                             navigationMode,
                                         }: {
    mod: ReviewModule;
    onModuleCompleteChange?: (done: boolean) => void;
    canUnlockAll?: boolean;
    footerInsetPx?: number;
    navigationMode?: FlowNavigationConfig;
}) {
    const params = useParams<{ locale: string; subjectSlug: string; moduleSlug: string }>();
    const router = useRouter();

    const locale = params?.locale ?? "en";
    const subjectSlug = params?.subjectSlug ?? "";
    const moduleSlug = params?.moduleSlug ?? "";
    const unlockAll = Boolean(canUnlockAll);
    const navModes = useMemo(
        () => resolveFlowNavigationConfig(navigationMode),
        [navigationMode],
    );

    const topics = Array.isArray(mod?.topics) ? mod.topics : [];
    const firstTopicId = topics[0]?.id ?? "";

    const { codeEnabled } = useMemo(() => {
        const meta = (mod as any)?.meta;
        return toolsPolicyForSubject(subjectSlug, meta);
    }, [subjectSlug, mod]);

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

    const viewTopic = useMemo(
        () => topics.find((t) => t.id === viewTopicId) ?? topics[0] ?? null,
        [topics, viewTopicId],
    );

    const viewCards = Array.isArray(viewTopic?.cards) ? viewTopic!.cards : [];
    const viewTid = viewTopic?.id ?? firstTopicId ?? "";

    const panels = useResizablePanels();
    const sketch = useDebouncedSketchState({ setProgress, viewTid });

    const toolDefaults = useMemo(
        () =>
            resolveToolDefaults({
                subjectSlug,
                moduleMeta: (mod as any)?.meta,
            }),
        [subjectSlug, mod],
    );

    const tool = useToolCodeRunnerState({
        progress,
        progressHydrated,
        setProgress,
        viewTid,
        defaultLang: toolDefaults.defaultLang,
        defaultCode: toolDefaults.defaultCode,
        defaultStdin: toolDefaults.defaultStdin,
        defaultSqlDialect: toolDefaults.defaultSqlDialect,
        rightCollapsed: panels.rightCollapsed,
        rightW: panels.rightW,
    });

    const topicRuntime = (viewTopic as any)?.meta?.runtimeDefaults ?? null;

    const topicSqlFallback = useMemo(() => {
        if (topicRuntime?.kind !== "sql" || !topicRuntime.datasetId) return null;

        return resolveSqlRunnerConfig({
            language: "sql",
            sqlDialect: topicRuntime.fixedSqlDialect,
            sqlDatasetId: topicRuntime.datasetId,
            defaultSqlDialect: toolDefaults.defaultSqlDialect,
        });
    }, [topicRuntime, toolDefaults.defaultSqlDialect]);

    const reduceMotion = useReduceMotion();

    const moduleComplete = useMemo(() => {
        if (!topics.length) return false;
        return topics.every((t) => {
            const cards = Array.isArray(t.cards) ? t.cards : [];
            const tstate = (progress as any)?.topics?.[t.id];
            return isTopicComplete(cards, tstate);
        });
    }, [topics, progress]);

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

    const handleEnsureToolsVisible = useCallback(() => {
        if (panels.rightCollapsed) {
            panels.setRightCollapsed(false);
        }
    }, [panels.rightCollapsed, panels.setRightCollapsed]);

    const handleBindToToolsPanel = useCallback(
        (args: Parameters<typeof tool.bindCodeInput>[0]) => {
            tool.bindCodeInput(args);
        },
        [tool.bindCodeInput],
    );

    const handleUnbindFromToolsPanel = useCallback(() => {
        tool.unbindCodeInput();
    }, [tool.unbindCodeInput]);

    const handleToolChangeCode = useCallback(
        (code: string) => {
            tool.setToolCode(code);
        },
        [tool.setToolCode],
    );

    const handleToolChangeStdin = useCallback(
        (stdin: string) => {
            tool.setToolStdin(stdin);
        },
        [tool.setToolStdin],
    );

    const handleBeforeRun = useCallback(() => {
        tool.flushLatest();
    }, [tool.flushLatest]);

    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const restoreActivityKeyRef = useRef<string>("");

    const viewProg: any = (progress as any)?.topics?.[viewTid] ?? {};
    const moduleV = (progress as any)?.quizVersion ?? 0;
    const topicV = (viewProg as any)?.quizVersion ?? 0;
    const versionStr = `${moduleV}.${topicV}`;
    const topicMotionKey = `${viewTid}:${versionStr}`;

    const activeIdx = useMemo(() => {
        const i = topics.findIndex((t) => t.id === activeTopicId);
        return i < 0 ? 0 : i;
    }, [topics, activeTopicId]);

    const topicUnlocked = useMemo(() => {
        return (tid: string) => {
            if (unlockAll) return true;
            const idx = topics.findIndex((x) => x.id === tid);
            if (idx <= 0) return true;
            const prev = topics[idx - 1];
            const prevState = (progress as any)?.topics?.[prev.id];
            return isTopicComplete(prev.cards ?? [], prevState);
        };
    }, [topics, progress, unlockAll]);

    useEffect(() => {
        const down = () => ((window as any).__flowPointerDown = true);
        const up = () => ((window as any).__flowPointerDown = false);

        window.addEventListener("pointerdown", down, true);
        window.addEventListener("pointerup", up, true);
        window.addEventListener("pointercancel", up, true);

        return () => {
            window.removeEventListener("pointerdown", down, true);
            window.removeEventListener("pointerup", up, true);
            window.removeEventListener("pointercancel", up, true);
        };
    }, []);

    useEffect(() => {
        onModuleCompleteChange?.(moduleComplete || Boolean((progress as any)?.moduleCompleted));
    }, [moduleComplete, progress, onModuleCompleteChange]);

    useEffect(() => {
        if (!progressHydrated) return;
        if (!moduleComplete) return;
        if ((progress as any)?.moduleCompleted) return;

        const nowIso = new Date().toISOString();
        const next: ReviewProgressState = {
            ...(progress as any),
            moduleCompleted: true,
            moduleCompletedAt: nowIso,
        };

        setProgress(next);
        flushNow(next);
    }, [moduleComplete, progressHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!progressHydrated) return;
        if (!viewTid) return;

        const doneNow = isTopicComplete(viewCards, (progress as any)?.topics?.[viewTid]);
        if (!doneNow) return;

        const tp: any = (progress as any)?.topics?.[viewTid] ?? {};
        if (tp.completed) return;

        const nowIso = new Date().toISOString();

        setProgress((p: any) => {
            const cur = p?.topics?.[viewTid] ?? {};
            if (cur.completed) return p;
            return {
                ...p,
                topics: {
                    ...(p.topics ?? {}),
                    [viewTid]: {
                        ...cur,
                        completed: true,
                        completedAt: cur.completedAt ?? nowIso,
                    },
                },
            };
        });
    }, [progressHydrated, viewTid, viewCards, progress]); // eslint-disable-line react-hooks/exhaustive-deps

    const assignmentSessionId = (progress as any)?.assignmentSessionId
        ? String((progress as any).assignmentSessionId)
        : null;
    const assignmentStatusEnabled = progressHydrated && Boolean(assignmentSessionId);

    const {
        status: assignmentStatus,
        complete: assignmentDone,
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
        ((moduleComplete || Boolean((progress as any)?.moduleCompleted)) && assignmentDone);

    const navLoading = nav === undefined;
    const navError = nav === null;
    const hasNextModule = !!nav && !!nav.nextModuleId;

    const handleAssignmentClick = useCallback(async () => {
        const returnToCurrentModule = `/${locale}/${ROUTES.learningPath(
            encodeURIComponent(subjectSlug),
            encodeURIComponent(moduleSlug),
        )}`;

        if (assignmentSessionId && assignmentStatus.phase !== "idle") {
            router.push(
                `/${ROUTES.practicePath(
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
            `/${ROUTES.practicePath(
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

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pending, setPending] = useState<null | { kind: "module" | "topic"; tid?: string }>(
        null,
    );

    const pendingStats = useMemo(() => {
        if (!pending) return { answeredCount: 0, sessionSize: 0, title: "", description: "" };

        if (pending.kind === "topic") {
            const tid = pending.tid ?? "";
            const cards = (topics.find((t) => t.id === tid)?.cards ?? []) as ReviewCard[];
            const tp0 = (progress as any)?.topics?.[tid] ?? {};
            const { answeredCount, sessionSize } = countAnswered(cards, tp0);
            return {
                answeredCount,
                sessionSize,
                title: "Reset this topic?",
                description: `You’ve completed ${answeredCount}/${sessionSize} items in this topic. This will clear them and cannot be undone.`,
            };
        }

        let answeredCount = 0;
        let sessionSize = 0;
        for (const t of topics) {
            const cards = (t.cards ?? []) as ReviewCard[];
            const tp0 = (progress as any)?.topics?.[t.id] ?? {};
            const r = countAnswered(cards, tp0);
            answeredCount += r.answeredCount;
            sessionSize += r.sessionSize;
        }

        return {
            answeredCount,
            sessionSize,
            title: "Reset the entire module?",
            description: `You’ve completed ${answeredCount}/${sessionSize} items in this module. This will clear everything and cannot be undone.`,
        };
    }, [pending, progress, topics]);

    const cancelPendingChange = useCallback(() => {
        setConfirmOpen(false);
        setPending(null);
    }, []);

    const applyPendingChange = useCallback(() => {
        if (!pending) return;

        tool.unbindCodeInput();

        if (pending.kind === "module") {
            const fallback = firstTopicId || "";
            const nextModuleV = ((progress as any)?.quizVersion ?? 0) + 1;

            const next: ReviewProgressState = {
                quizVersion: nextModuleV,
                topics: {},
                activeTopicId: fallback as any,
                moduleCompleted: false,
                moduleCompletedAt: undefined,
            } as any;

            setProgress(next);
            setActiveTopicId(fallback);
            setViewTopicId(fallback);
            flushNow(next);

            cancelPendingChange();
            return;
        }

        const tid = pending.tid ?? "";
        if (!tid) return cancelPendingChange();

        setProgress((p: any) => {
            const nextTopics = { ...(p.topics ?? {}) };
            const cur = nextTopics[tid] ?? {};
            const nextTopicV = (cur.quizVersion ?? 0) + 1;

            nextTopics[tid] = {
                quizVersion: nextTopicV,
                cardsDone: {},
                quizzesDone: {},
                quizState: {},
                sketchState: {},
                toolState: {},
                completed: false,
                completedAt: undefined,
            };

            const next = { ...p, topics: nextTopics };
            flushNow(next);
            return next;
        });

        cancelPendingChange();
    }, [
        pending,
        tool.unbindCodeInput,
        firstTopicId,
        progress,
        setProgress,
        setActiveTopicId,
        setViewTopicId,
        flushNow,
        cancelPendingChange,
    ]);

    const requestResetModule = useCallback(() => {
        setPending({ kind: "module" });
        setConfirmOpen(true);
    }, []);

    const requestResetTopic = useCallback((tid: string) => {
        if (!tid) return;
        setPending({ kind: "topic", tid });
        setConfirmOpen(true);
    }, []);

    const mainScrollRef = useRef<HTMLElement | null>(null);

    const mdUp = useMediaQuery("(min-width: 768px)");
    const lgUp = useMediaQuery("(min-width: 1024px)");

    const showDesktopLeft = mdUp;
    const TOOLS_DESKTOP_ONLY = true;
    const toolsUiEnabled = TOOLS_DESKTOP_ONLY ? lgUp : mdUp;
    const showDesktopRight = toolsUiEnabled;

    const [mobileTopicsOpen, setMobileTopicsOpen] = useState(false);

    useEffect(() => {
        if (mdUp) setMobileTopicsOpen(false);
    }, [mdUp]);

    const leftCollapsedEff = showDesktopLeft ? panels.leftCollapsed : true;
    const rightCollapsedEff = showDesktopRight ? panels.rightCollapsed : true;

    const cardElRef = useRef(new Map<string, HTMLDivElement | null>());
    const setCardEl = useCallback(
        (id: string) => (el: HTMLDivElement | null) => {
            cardElRef.current.set(id, el);
        },
        [],
    );

    useEffect(() => {
        cardElRef.current.clear();
    }, [topicMotionKey]);

    const isQuizLikeCard = useCallback((c: ReviewCard) => {
        return c.type === "quiz" || c.type === "project";
    }, []);

    const isCardDone = useCallback(
        (c: ReviewCard, tp0: any) => {
            if (isQuizLikeCard(c)) return Boolean(tp0?.quizzesDone?.[c.id]);
            return Boolean(tp0?.cardsDone?.[c.id]);
        },
        [isQuizLikeCard],
    );

    const userIsInteracting = useCallback(() => {
        if (typeof window !== "undefined" && (window as any).__flowPointerDown) return true;

        const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (sel && !sel.isCollapsed) return true;

        const ae =
            typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
        if (!ae) return false;

        const tag = ae.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        if (ae.isContentEditable) return true;

        return false;
    }, []);

    const visibleRatio = useCallback((el: HTMLElement, container: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const c = container.getBoundingClientRect();

        const top = Math.max(r.top, c.top);
        const bot = Math.min(r.bottom, c.bottom);
        const visPx = Math.max(0, bot - top);
        const h = Math.max(1, r.height);

        return visPx / h;
    }, []);

    const focusPrimaryAction = useCallback((root: HTMLElement) => {
        const preferred =
            root.querySelector<HTMLElement>(
                'button[data-flow-focus]:not([disabled]),' +
                'input[data-flow-focus]:not([disabled]),' +
                'textarea[data-flow-focus]:not([disabled]),' +
                'select[data-flow-focus]:not([disabled]),' +
                '[tabindex][data-flow-focus]:not([tabindex="-1"])',
            ) ??
            root.querySelector<HTMLElement>("button.ui-quiz-action--primary:not([disabled])") ??
            root.querySelector<HTMLElement>("button.ui-btn-primary:not([disabled])") ??
            root.querySelector<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );

        preferred?.focus({ preventScroll: true } as any);
    }, []);

    const scrollToCardId = useCallback(
        (id: string) => {
            const el = cardElRef.current.get(id);
            if (!el) return;

            if (userIsInteracting()) return;

            const container = mainScrollRef.current;
            if (!container) {
                el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
                return;
            }

            const ratio = visibleRatio(el, container);
            const needsScroll = ratio < 0.6;

            if (needsScroll) {
                el.scrollIntoView({
                    behavior: reduceMotion ? "auto" : "smooth",
                    block: "start",
                });
            }

            const focusLater = () => focusPrimaryAction(el);

            if (reduceMotion || !needsScroll) requestAnimationFrame(focusLater);
            else window.setTimeout(focusLater, 250);
        },
        [reduceMotion, userIsInteracting, visibleRatio, focusPrimaryAction],
    );

    const findCurrentActivityCardId = useCallback(
        (state: any) => {
            const tp0 = state?.topics?.[viewTid] ?? {};
            const prereqsAllQuizzes = unlockAll
                ? true
                : prereqsMetForAnyQuizOrProject(viewCards, tp0);

            for (const c of viewCards) {
                if (isCardDone(c, tp0)) continue;
                if (isQuizLikeCard(c) && !prereqsAllQuizzes) continue;
                return c.id;
            }

            return viewCards[viewCards.length - 1]?.id ?? null;
        },
        [viewTid, viewCards, unlockAll, isCardDone, isQuizLikeCard],
    );

    const findCurrentActivityCardIndex = useCallback(
        (state: any) => {
            const id = findCurrentActivityCardId(state);
            const idx = viewCards.findIndex((c: any) => c.id === id);
            return idx < 0 ? 0 : idx;
        },
        [findCurrentActivityCardId, viewCards],
    );

    const findNextActionableCardIndex = useCallback(
        (fromIndex: number, nextProgress: any) => {
            const tp0 = nextProgress?.topics?.[viewTid] ?? {};
            const prereqsAllQuizzes = unlockAll ? true : prereqsMetForAnyQuizOrProject(viewCards, tp0);

            for (let i = fromIndex + 1; i < viewCards.length; i++) {
                const c = viewCards[i];
                if (isCardDone(c, tp0)) continue;
                if (isQuizLikeCard(c) && !prereqsAllQuizzes) continue;
                return i;
            }

            return -1;
        },
        [viewTid, unlockAll, viewCards, isCardDone, isQuizLikeCard],
    );

    const scrollToNextActionable = useCallback(
        (fromIndex: number, nextProgress: any) => {
            const nextIndex = findNextActionableCardIndex(fromIndex, nextProgress);
            if (nextIndex < 0) return;

            if (navModes.cards === "slideshow") {
                setActiveCardIndex(nextIndex);
                return;
            }

            const nextCard = viewCards[nextIndex];
            if (!nextCard) return;
            requestAnimationFrame(() => scrollToCardId(nextCard.id));
        },
        [findNextActionableCardIndex, navModes.cards, viewCards, scrollToCardId],
    );

    const commitProgress = useCallback(
        (updater: (p: any) => any) => {
            setProgress((p: any) => {
                const next = updater(p);
                queueMicrotask(() => flushNow(next));
                return next;
            });
        },
        [setProgress, flushNow],
    );

    const moduleProgress = useMemo(() => {
        const total = topics.length;
        const done = topics.reduce((acc, t) => {
            const tstate = (progress as any)?.topics?.[t.id];
            const cards = (t.cards ?? []) as ReviewCard[];
            return acc + (isTopicComplete(cards, tstate) ? 1 : 0);
        }, 0);
        return { total, done, pct: total ? clamp01(done / total) : 0 };
    }, [topics, progress]);

    const tp: any = (progress as any)?.topics?.[viewTid] ?? {};
    const prereqsForAllQuizzes = unlockAll ? true : prereqsMetForAnyQuizOrProject(viewCards, tp);

    const showSkeleton = useSkeletonGate({
        ready: progressHydrated,
        swapKey: `${subjectSlug}:${moduleSlug}:${locale}`,
        reduceMotion,
        initialMinMs: 240,
        swapMs: 170,
    });

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

    useEffect(() => {
        if (!progressHydrated) return;
        if (showSkeleton) return;
        if (!viewTid) return;
        if (userIsInteracting()) return;

        const restoreKey = `${subjectSlug}:${moduleSlug}:${topicMotionKey}:restore`;
        if (restoreActivityKeyRef.current === restoreKey) return;
        restoreActivityKeyRef.current = restoreKey;

        if (navModes.cards === "slideshow") {
            setActiveCardIndex(findCurrentActivityCardIndex(progress));
            return;
        }

        const targetId = findCurrentActivityCardId(progress);
        if (!targetId) return;

        const run = () => scrollToCardId(targetId);

        requestAnimationFrame(() => {
            requestAnimationFrame(run);
        });
    }, [
        progressHydrated,
        showSkeleton,
        subjectSlug,
        moduleSlug,
        topicMotionKey,
        viewTid,
        progress,
        findCurrentActivityCardId,
        findCurrentActivityCardIndex,
        scrollToCardId,
        navModes.cards,
        userIsInteracting,
    ]);

    const handleBack = useCallback(() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
        }

        router.push(`/${locale}`);
    }, [router, locale]);

    const footerPad = footerInsetPx ? footerInsetPx + 12 : 0;
    const padStyle = {
        paddingBottom: undefined,
        scrollPaddingBottom: footerPad || undefined,
        ["--flow-bottom-inset" as any]: `${footerPad || 0}px`,
    } as React.CSSProperties;

    if (!topics.length) {
        return (
            <div className="h-full w-full p-6 text-sm text-neutral-600 dark:text-white/70">
                This module has no topics yet.
            </div>
        );
    }

    const viewIsComplete = isTopicComplete(viewCards, (progress as any)?.topics?.[viewTid]);
    const viewIdx = topics.findIndex((t) => t.id === viewTid);
    const prevTopic = viewIdx > 0 ? topics[viewIdx - 1] : null;
    const nextTopic = viewIdx >= 0 ? topics[viewIdx + 1] : null;

    const goToTopic = useCallback(
        (tid: string) => {
            if (!tid) return;
            const idx = topics.findIndex((x) => x.id === tid);
            if (idx < 0) return;

            if (!unlockAll) {
                const isEarlierOrActive = idx <= activeIdx;
                const canGoForward = topicUnlocked(tid);
                if (!isEarlierOrActive && !canGoForward) return;
            }

            if (idx > activeIdx) setActiveTopicId(tid);
            setViewTopicId(tid);
        },
        [topics, unlockAll, activeIdx, topicUnlocked, setActiveTopicId, setViewTopicId],
    );

    const goPrevTopic = useCallback(() => {
        if (!prevTopic?.id) return;
        goToTopic(prevTopic.id);
    }, [prevTopic?.id, goToTopic]);

    const goNextTopic = useCallback(() => {
        if (!nextTopic?.id) return;
        goToTopic(nextTopic.id);
    }, [nextTopic?.id, goToTopic]);

    const handleResetCurrentTopic = useCallback(() => {
        requestResetTopic(viewTid);
    }, [requestResetTopic, viewTid]);

    const handleOpenCertificate = useCallback(() => {
        router.push(`/subjects/${encodeURIComponent(subjectSlug)}/certificate`);
    }, [router, subjectSlug]);

    const handleToggleLeftPanel = useCallback(() => {
        if (showDesktopLeft) panels.setLeftCollapsed((v) => !v);
        else setMobileTopicsOpen(true);
    }, [showDesktopLeft, panels.setLeftCollapsed]);

    const handleToggleRightPanel = useCallback(() => {
        panels.setRightCollapsed((v) => !v);
    }, [panels.setRightCollapsed]);

    const handleCollapseLeft = useCallback(() => {
        panels.setLeftCollapsed(true);
    }, [panels.setLeftCollapsed]);

    const handleCollapseRight = useCallback(() => {
        panels.setRightCollapsed(true);
    }, [panels.setRightCollapsed]);

    const sidebarTopicItems = useMemo<SidebarTopicItemVm[]>(() => {
        return topics.map((t, idx) => {
            const isEarlierOrActive = idx <= activeIdx;
            const canGoForward = topicUnlocked(t.id);
            const disabled = unlockAll ? false : !isEarlierOrActive && !canGoForward;

            const done = progressHydrated
                ? isTopicComplete((t.cards ?? []) as ReviewCard[], (progress as any)?.topics?.[t.id])
                : false;

            return {
                id: t.id,
                label: t.label ?? "",
                summary: t.summary ?? null,
                disabled,
                done,
                isViewing: viewTopicId === t.id,
                isActive: activeTopicId === t.id,
            };
        });
    }, [
        topics,
        activeIdx,
        activeTopicId,
        viewTopicId,
        topicUnlocked,
        unlockAll,
        progressHydrated,
        progress,
    ]);

    const content = (
        <div
            className="relative h-full w-full overflow-hidden bg-[radial-gradient(1200px_700px_at_20%_0%,#eafff5_0%,#ffffff_55%,#f6f7ff_100%)] dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-neutral-900 dark:text-white/90"
            aria-busy={showSkeleton}
        >
            {!reduceMotion ? (
                <div className="ui-reveal-mask" data-show={showMask ? "true" : "false"} />
            ) : null}

            {confirmOpen ? (
                <ConfirmResetModal
                    open={confirmOpen}
                    title={pendingStats.title}
                    description={pendingStats.description}
                    confirmText="Reset"
                    cancelText="Cancel"
                    danger={true}
                    onConfirm={applyPendingChange}
                    onClose={cancelPendingChange}
                />
            ) : null}

            <MobileDrawer
                open={mobileTopicsOpen}
                side="left"
                title="Topics"
                reduceMotion={reduceMotion}
                onClose={() => setMobileTopicsOpen(false)}
            >
                <div className="p-3" style={padStyle}>
                    <ModuleSidebar
                        mod={mod}
                        topicItems={sidebarTopicItems}
                        unlockAll={unlockAll}
                        moduleProgress={moduleProgress}
                        onGoToTopic={(tid) => {
                            goToTopic(tid);
                            setMobileTopicsOpen(false);
                        }}
                        onResetModule={requestResetModule}
                        onCollapse={() => setMobileTopicsOpen(false)}
                        assignmentPct={assignmentRightPct}
                        assignmentMissedPct={assignmentMissedPct}
                        assignmentLabel={assignmentLabel}
                        assignmentSublabel={assignmentSublabel}
                        onAssignmentClick={handleAssignmentClick}
                        hasNextModule={hasNextModule}
                        navLoading={navLoading}
                        navError={navError}
                        canGoNextModule={canGoNextModule}
                    />
                </div>
            </MobileDrawer>

            <AnimatePresence mode="wait" initial={false}>
                {showSkeleton ? (
                    <motion.div
                        key="skel"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.18 }}
                        className="h-full w-full"
                    >
                        <div className="h-full w-full pointer-events-none">
                            <ReviewModuleSkeleton
                                leftCollapsed={leftCollapsedEff}
                                rightCollapsed={rightCollapsedEff}
                                leftW={panels.leftW}
                                rightW={panels.rightW}
                            />
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="content"
                        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{
                            duration: reduceMotion ? 0 : 0.24,
                            ease: [0.16, 1, 0.3, 1],
                        }}
                        className="h-full w-full"
                    >
                        <div className="h-full w-full flex flex-col min-h-0">
                            <div className="shrink-0">
                                <HeaderSlick
                                    slot={
                                        <div className="inline-flex items-center gap-2 whitespace-nowrap [&>button]:shrink-0">
                                            <button
                                                type="button"
                                                onClick={handleBack}
                                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                                title="Go back"
                                            >
                                                ← Back
                                            </button>

                                            <button
                                                type="button"
                                                onClick={handleToggleLeftPanel}
                                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                                title="Topics"
                                            >
                                                {showDesktopLeft
                                                    ? panels.leftCollapsed
                                                        ? "Topics ▶"
                                                        : "Topics ◀"
                                                    : "Topics"}
                                            </button>

                                            {toolsUiEnabled ? (
                                                <button
                                                    type="button"
                                                    onClick={handleToggleRightPanel}
                                                    className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                                    title="Tools"
                                                >
                                                    {panels.rightCollapsed ? "Tools ▶" : "Tools ◀"}
                                                </button>
                                            ) : null}

                                            <button
                                                type="button"
                                                onClick={handleResetCurrentTopic}
                                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap hidden sm:inline-flex"
                                            >
                                                Reset topic
                                            </button>

                                            <button
                                                type="button"
                                                onClick={goPrevTopic}
                                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                                disabled={!prevTopic?.id}
                                                title={!prevTopic?.id ? "No previous topic" : "Previous topic"}
                                            >
                                                ←
                                            </button>

                                            <button
                                                type="button"
                                                onClick={goNextTopic}
                                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                                disabled={!nextTopic?.id || (!unlockAll && !viewIsComplete)}
                                                title={
                                                    !nextTopic?.id
                                                        ? "No next topic"
                                                        : !unlockAll && !viewIsComplete
                                                            ? "Complete the topic to continue"
                                                            : "Next topic"
                                                }
                                            >
                                                →
                                            </button>
                                        </div>
                                    }
                                    isBillingStatus={false}
                                    brand={process.env.NEXT_PUBLIC_APP_NAME}
                                    badge="MVP"
                                    isUser={false}
                                    isNav={false}
                                />
                            </div>

                            <div className="flex-1 min-h-0 w-full">
                                <div className="h-full min-h-0 flex">
                                    {showDesktopLeft ? (
                                        <>
                                            <aside
                                                className={cn(
                                                    "min-h-0 transition-[width] duration-300 ease-out overflow-hidden",
                                                    panels.leftCollapsed && "w-0",
                                                )}
                                                style={{ width: panels.leftCollapsed ? 0 : panels.leftW }}
                                            >
                                                <div className="h-full min-h-0 overflow-auto" style={padStyle}>
                                                    <ModuleSidebar
                                                        mod={mod}
                                                        topicItems={sidebarTopicItems}
                                                        unlockAll={unlockAll}
                                                        moduleProgress={moduleProgress}
                                                        onGoToTopic={goToTopic}
                                                        onResetModule={requestResetModule}
                                                        onCollapse={handleCollapseLeft}
                                                        assignmentPct={assignmentRightPct}
                                                        assignmentMissedPct={assignmentMissedPct}
                                                        assignmentLabel={assignmentLabel}
                                                        assignmentSublabel={assignmentSublabel}
                                                        onAssignmentClick={handleAssignmentClick}
                                                        hasNextModule={hasNextModule}
                                                        navLoading={navLoading}
                                                        navError={navError}
                                                        canGoNextModule={canGoNextModule}
                                                    />
                                                </div>
                                            </aside>

                                            {!panels.leftCollapsed ? (
                                                <div
                                                    onMouseDown={panels.onMouseDownLeftHandle}
                                                    className="w-2 cursor-col-resize rounded-xl bg-neutral-200/60 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10"
                                                    title="Drag to resize sidebar"
                                                />
                                            ) : null}
                                        </>
                                    ) : null}

                                    <main
                                        ref={mainScrollRef}
                                        className="flex-1 min-w-0 min-h-0 overflow-auto"
                                        style={padStyle}
                                    >
                                        {leftCollapsedEff ? (
                                            <div className="mb-3 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleToggleLeftPanel}
                                                    className="ui-btn ui-btn-secondary text-xs font-extrabold"
                                                >
                                                    Topics ▶
                                                </button>
                                            </div>
                                        ) : null}

                                        <TopicShell title={viewTopic?.label ?? ""} subtitle={viewTopic?.summary ?? null}>
                                            <AnimatedTopicPane
                                                motionKey={topicMotionKey}
                                                viewCards={viewCards}
                                                activeCardIndex={activeCardIndex}
                                                onActiveCardIndexChange={setActiveCardIndex}
                                                navModes={navModes}
                                                reduceMotion={reduceMotion}
                                                tp={tp}
                                                progressHydrated={progressHydrated}
                                                versionStr={versionStr}
                                                prereqsForAllQuizzes={prereqsForAllQuizzes}
                                                viewTid={viewTid}
                                                sketch={sketch}
                                                setProgress={setProgress}
                                                flushNow={flushNow}
                                                scrollToNextActionable={scrollToNextActionable}
                                                commitProgress={commitProgress}
                                                setCardEl={setCardEl}
                                                viewIsComplete={viewIsComplete}
                                                viewTopic={viewTopic}
                                                onContinue={nextTopic?.id ? goNextTopic : undefined}
                                                showSubjectFinish={!nextTopic?.id}
                                                subjectSlug={subjectSlug}
                                                subjectFinish={subjectFinish}
                                                onOpenCertificate={handleOpenCertificate}
                                            />
                                        </TopicShell>
                                    </main>

                                    {showDesktopRight ? (
                                        <>
                                            {!panels.rightCollapsed ? (
                                                <div
                                                    onMouseDown={panels.onMouseDownRightHandle}
                                                    className="w-2 cursor-col-resize rounded-xl bg-neutral-200/60 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10"
                                                    title="Drag to resize tools panel"
                                                />
                                            ) : null}

                                            <aside
                                                className={cn(
                                                    "min-h-0 transition-[width] duration-300 ease-out overflow-hidden",
                                                    panels.rightCollapsed && "w-0",
                                                )}
                                                style={{ width: panels.rightCollapsed ? 0 : panels.rightW }}
                                            >
                                                <ToolsPanel
                                                    onCollapse={handleCollapseRight}
                                                    onUnbind={handleUnbindFromToolsPanel}
                                                    boundId={tool.boundId}
                                                    rightBodyRef={tool.rightBodyRef}
                                                    codeRunnerRegionH={tool.codeRunnerRegionH}
                                                    toolLang={tool.toolLang as CodeLanguage}
                                                    toolCode={tool.toolCode}
                                                    toolStdin={tool.toolStdin}
                                                    toolSqlDialect={
                                                        tool.toolSqlDatasetId
                                                            ? tool.toolSqlDialect
                                                            : (topicSqlFallback?.sqlDialect ?? tool.toolSqlDialect)
                                                    }
                                                    onChangeCode={handleToolChangeCode}
                                                    onChangeStdin={handleToolChangeStdin}
                                                    onBeforeRun={handleBeforeRun}
                                                    subjectSlug={subjectSlug}
                                                    moduleId={moduleSlug}
                                                    locale={locale}
                                                    codeEnabled={codeEnabled}
                                                    showLanguagePicker={false}
                                                    showSqlDialectPicker={false}
                                                    sqlSchemaSql={
                                                        tool.toolSqlSchemaSql ??
                                                        topicSqlFallback?.sqlSchemaSql ??
                                                        STUDENTS_SQL_SCHEMA
                                                    }
                                                    sqlSeedSql={
                                                        tool.toolSqlSeedSql ??
                                                        topicSqlFallback?.sqlSeedSql ??
                                                        STUDENTS_SQL_SEED
                                                    }
                                                    sqlInitialTableSnapshots={
                                                        tool.toolSqlInitialTableSnapshots ??
                                                        topicSqlFallback?.sqlInitialTableSnapshots ??
                                                        STUDENTS_INITIAL_TABLE_SNAPSHOTS
                                                    }
                                                />
                                            </aside>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    if (!toolsUiEnabled) return content;

    return (
        <ReviewToolsProvider
            mode="first_unanswered"
            resetKey={`${viewTid}:${versionStr}`}
            externalBoundId={tool.boundId}
            ensureVisible={handleEnsureToolsVisible}
            onBindToToolsPanel={handleBindToToolsPanel}
            onUnbindFromToolsPanel={handleUnbindFromToolsPanel}
        >
            {content}
        </ReviewToolsProvider>
    );
}

function AnimatedTopicPane(props: {
    motionKey: string;
    viewCards: ReviewCard[];
    activeCardIndex: number;
    onActiveCardIndexChange: (index: number) => void;
    navModes: ReturnType<typeof resolveFlowNavigationConfig>;
    reduceMotion: boolean;
    tp: any;
    progressHydrated: boolean;
    versionStr: string;
    prereqsForAllQuizzes: boolean;
    viewTid: string;
    sketch: ReturnType<typeof useDebouncedSketchState>;
    setProgress: React.Dispatch<any>;
    flushNow: (next: any) => void;
    scrollToNextActionable: (fromIndex: number, nextProgress: any) => void;
    commitProgress: (updater: (p: any) => any) => void;
    setCardEl: (id: string) => (el: HTMLDivElement | null) => void;
    viewIsComplete: boolean;
    viewTopic: any;
    onContinue?: () => void;
    showSubjectFinish: boolean;
    subjectSlug: string;
    subjectFinish: any;
    onOpenCertificate: () => void;
}) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <AnimatePresence initial={false} mode="wait">
                <motion.div
                    key={props.motionKey}
                    initial={props.reduceMotion ? false : TOPIC_PANE_ANIM.initial}
                    animate={TOPIC_PANE_ANIM.animate}
                    exit={props.reduceMotion ? undefined : TOPIC_PANE_ANIM.exit}
                    transition={props.reduceMotion ? { duration: 0 } : TOPIC_PANE_TRANSITION}
                    className="flex h-full min-h-0 flex-col"
                >
                    <FlowNavigator
                        items={props.viewCards}
                        mode={props.navModes.cards}
                        activeIndex={props.activeCardIndex}
                        onActiveIndexChange={props.onActiveCardIndexChange}
                        reduceMotion={props.reduceMotion}
                        getKey={(card: any) => card.id}
                        getProgressLabel={(index, total) => `Item ${index + 1} of ${total}`}
                        canGoPrev={props.activeCardIndex > 0}
                        canGoNext={props.activeCardIndex < Math.max(0, props.viewCards.length - 1)}
                        onPrev={() => props.onActiveCardIndexChange(Math.max(0, props.activeCardIndex - 1))}
                        onNext={() =>
                            props.onActiveCardIndexChange(
                                Math.min(props.viewCards.length - 1, props.activeCardIndex + 1),
                            )
                        }
                        renderItem={(card: any, cardIndex: number) => {
                            const savedQuiz = (props.tp?.quizState?.[card.id] ?? null) as SavedQuizState | null;
                            const savedSketch = props.tp?.sketchState?.[card.id] ?? null;

                            const isQuizLike = card.type === "quiz" || card.type === "project";
                            const done = isQuizLike
                                ? Boolean(props.tp?.quizzesDone?.[card.id])
                                : Boolean(props.tp?.cardsDone?.[card.id]);

                            const prereqsMet = isQuizLike ? props.prereqsForAllQuizzes : true;

                            return (
                                <div key={card.id} ref={props.setCardEl(card.id)}>
                                    <CardRenderer
                                        card={card}
                                        done={done}
                                        cardIndex={cardIndex}
                                        quizNavMode={props.navModes.quiz}
                                        prereqsMet={prereqsMet}
                                        progressHydrated={props.progressHydrated}
                                        savedQuiz={props.progressHydrated ? savedQuiz : null}
                                        versionStr={props.versionStr}
                                        savedSketch={props.progressHydrated ? savedSketch : null}
                                        onSketchStateChange={(sketchCardId, s) =>
                                            props.sketch.saveSketchDebounced(props.viewTid, sketchCardId, s)
                                        }
                                        onMarkDone={() => {
                                            props.setProgress((p: any) => {
                                                const tp0: any = p.topics?.[props.viewTid] ?? {};
                                                const cardsDone = { ...(tp0.cardsDone ?? {}), [card.id]: true };
                                                const next = {
                                                    ...p,
                                                    topics: { ...(p.topics ?? {}), [props.viewTid]: { ...tp0, cardsDone } },
                                                };

                                                queueMicrotask(() => {
                                                    props.flushNow(next);
                                                    props.scrollToNextActionable(cardIndex, next);
                                                });

                                                return next;
                                            });
                                        }}
                                        onQuizPass={(quizId) => {
                                            props.setProgress((p: any) => {
                                                const tp0: any = p.topics?.[props.viewTid] ?? {};
                                                const quizzesDone = { ...(tp0.quizzesDone ?? {}), [quizId]: true };
                                                const next = {
                                                    ...p,
                                                    topics: { ...(p.topics ?? {}), [props.viewTid]: { ...tp0, quizzesDone } },
                                                };

                                                queueMicrotask(() => {
                                                    props.flushNow(next);
                                                    props.scrollToNextActionable(cardIndex, next);
                                                });

                                                return next;
                                            });
                                        }}
                                        onQuizStateChange={(quizCardId, s) => {
                                            props.setProgress((p: any) => {
                                                const tp0: any = p.topics?.[props.viewTid] ?? {};
                                                const quizState = { ...(tp0.quizState ?? {}), [quizCardId]: s };
                                                return {
                                                    ...p,
                                                    topics: { ...(p.topics ?? {}), [props.viewTid]: { ...tp0, quizState } },
                                                };
                                            });
                                        }}
                                        onQuizReset={(quizCardId) => {
                                            props.commitProgress((p) => {
                                                const tp0: any = p.topics?.[props.viewTid] ?? {};
                                                const nextQuizState = { ...(tp0.quizState ?? {}) };
                                                delete nextQuizState[quizCardId];

                                                const nextQuizzesDone = { ...(tp0.quizzesDone ?? {}) };
                                                delete nextQuizzesDone[quizCardId];

                                                return {
                                                    ...p,
                                                    topics: {
                                                        ...(p.topics ?? {}),
                                                        [props.viewTid]: {
                                                            ...tp0,
                                                            quizState: nextQuizState,
                                                            quizzesDone: nextQuizzesDone,
                                                        },
                                                    },
                                                };
                                            });
                                        }}
                                    />
                                </div>
                            );
                        }}
                    />

                    {props.viewIsComplete ? (
                        <div className="mt-3 shrink-0">
                            <TopicOutro topic={props.viewTopic} onContinue={props.onContinue} />
                        </div>
                    ) : null}

                    {props.showSubjectFinish ? (
                        <SubjectFinishBanner
                            subjectSlug={props.subjectSlug}
                            subjectFinish={props.subjectFinish}
                            onOpenCertificate={props.onOpenCertificate}
                        />
                    ) : null}

                    <div className="ui-surface-muted mt-2 flex-1 min-h-0 overflow-auto rounded-none" />
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

function moduleCompleteFromProgress(progress: any, topics: ReviewModule["topics"] | undefined) {
    const safeTopics = Array.isArray(topics) ? topics : [];
    if (!safeTopics.length) return false;

    return safeTopics.every((t) => {
        const cards = Array.isArray(t.cards) ? t.cards : [];
        const tstate = progress?.topics?.[t.id];
        return isTopicComplete(cards, tstate);
    });
}