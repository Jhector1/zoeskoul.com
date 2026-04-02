// src/components/review/module/ReviewModuleView.tsx
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
import ModuleSidebar from "./components/ModuleSidebar";
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

/* ✅ skeleton + animations */
import { AnimatePresence, motion } from "framer-motion";
import ReviewModuleSkeleton from "@/components/review/module/ReviewModuleSkeleton";
import { useSkeletonGate } from "@/components/review/module/hooks/useSkeletonGate";
import HeaderSlick from "@/components/HeaderSlick";
import {flowLog, shortCode} from "@/lib/debug/codeFlowDebug";

/* -----------------------------
   ✅ MOBILE-FIRST RESPONSIVE
-------------------------------- */

function useMediaQuery(query: string) {
    const [matches, setMatches] = React.useState(false);

    React.useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia(query);

        const apply = () => setMatches(Boolean(mq.matches));
        apply();

        if (mq.addEventListener) mq.addEventListener("change", apply);
        else (mq as any).addListener?.(apply);

        return () => {
            if (mq.removeEventListener) mq.removeEventListener("change", apply);
            else (mq as any).removeListener?.(apply);
        };
    }, [query]);

    return matches;
}

function MobileDrawer(props: {
    open: boolean;
    side: "left" | "right";
    title: string;
    reduceMotion: boolean;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const { open, side, title, reduceMotion, onClose, children } = props;

    return (
        <AnimatePresence>
            {open ? (
                <>
                    {/* backdrop */}
                    <motion.button
                        type="button"
                        aria-label="Close drawer"
                        className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[2px]"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    />

                    {/* panel */}
                    <motion.aside
                        className={cn(
                            "fixed top-0 bottom-0 z-[100] w-[min(92vw,380px)]",
                            "bg-white/85 backdrop-blur border border-neutral-200/70",
                            "dark:bg-[#0b0d12]/85 dark:border-white/10",
                            "shadow-2xl",
                            side === "left" ? "left-0 rounded-r-2xl" : "right-0 rounded-l-2xl"
                        )}
                        initial={{ x: side === "left" ? -24 : 24, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: side === "left" ? -24 : 24, opacity: 0 }}
                        transition={{
                            duration: reduceMotion ? 0 : 0.2,
                            ease: [0.16, 1, 0.3, 1],
                        }}
                    >
                        <div className="h-full min-h-0 flex flex-col">
                            <div className="shrink-0 flex items-center justify-between gap-2 p-3">
                                <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                                    {title}
                                </div>
                                <button
                                    type="button"
                                    className="ui-btn ui-btn-secondary text-xs font-extrabold"
                                    onClick={onClose}
                                >
                                    Close
                                </button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto">{children}</div>
                        </div>
                    </motion.aside>
                </>
            ) : null}
        </AnimatePresence>
    );
}

export default function ReviewModuleView({
                                             mod,
                                             onModuleCompleteChange,
                                             canUnlockAll = false,
                                             footerInsetPx = 0,
                                         }: {
    mod: ReviewModule;
    onModuleCompleteChange?: (done: boolean) => void;
    canUnlockAll?: boolean;
    footerInsetPx?: number;
}) {
    const params = useParams<{ locale: string; subjectSlug: string; moduleSlug: string }>();
    const router = useRouter();

    const locale = params?.locale ?? "en";
    const subjectSlug = params?.subjectSlug ?? "";
    const moduleId = params?.moduleSlug ?? "";

    const unlockAll = Boolean(canUnlockAll);

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
    } = useReviewProgress({ subjectSlug, moduleId, locale, firstTopicId });

    const viewTopic = useMemo(
        () => topics.find((t) => t.id === viewTopicId) ?? topics[0] ?? null,
        [topics, viewTopicId]
    );

    const viewCards = Array.isArray(viewTopic?.cards) ? viewTopic!.cards : [];
    const viewTid = viewTopic?.id ?? firstTopicId ?? "";

    // panels (collapse + resize)
    const panels = useResizablePanels();

    // sketch debounce
    const sketch = useDebouncedSketchState({ setProgress, viewTid });

    // tool (CodeRunner) state (safe even if tools UI hidden; no ToolsPanel mount = no Monaco)
    const tool = useToolCodeRunnerState({
        progress,
        progressHydrated,
        setProgress,
        viewTid,
        rightCollapsed: panels.rightCollapsed,
        rightW: panels.rightW,
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
        [tool.bindCodeInput]
    );

    const handleUnbindFromToolsPanel = useCallback(() => {
        tool.unbindCodeInput();
    }, [tool.unbindCodeInput]);

    const handleToolChangeLang = useCallback(
        (lang: CodeLanguage) => {
            tool.setToolLang(lang);
        },
        [tool.setToolLang]
    );

    const handleToolChangeCode = useCallback(
        (code: string) => {
            tool.setToolCode(code);
        },
        [tool.setToolCode]
    );
// add near your other refs
    const restoreActivityKeyRef = useRef<string>("");
    const handleToolChangeStdin = useCallback(
        (stdin: string) => {
            tool.setToolStdin(stdin);
        },
        [tool.setToolStdin]
    );
    // versions (for forcing rerender on reset)
    const viewProg: any = (progress as any)?.topics?.[viewTid] ?? {};
    const moduleV = (progress as any)?.quizVersion ?? 0;
    const topicV = (viewProg as any)?.quizVersion ?? 0;
    const versionStr = `${moduleV}.${topicV}`;
    const topicRenderKey = `${viewTid}:${versionStr}`;

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

    const moduleComplete = useMemo(() => {
        if (!topics.length) return false;
        return topics.every((t) => {
            const cards = Array.isArray(t.cards) ? t.cards : [];
            const tstate = (progress as any)?.topics?.[t.id];
            return isTopicComplete(cards, tstate);
        });
    }, [topics, progress]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moduleComplete, progressHydrated]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [progressHydrated, viewTid, viewCards, progress]);

    const assignmentSessionId = (progress as any)?.assignmentSessionId
        ? String((progress as any).assignmentSessionId)
        : null;
    const assignmentStatusEnabled = progressHydrated && Boolean(assignmentSessionId);

    const {
        status: assignmentStatus,
        complete: assignmentDone,
        pct: assignmentPct,
        rightPct: assignmentRightPct,
        missedPct: assignmentMissedPct,
        refresh: refreshAssignmentStatus,
    } = useAssignmentStatus({
        sessionId: assignmentSessionId,
        enabled: assignmentStatusEnabled,
        subject: subjectSlug,
        module: moduleId,
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

    const nav = useModuleNav({ subjectSlug, moduleId });
    const canGoNextModule =
        unlockAll ||
        ((moduleComplete || Boolean((progress as any)?.moduleCompleted)) && assignmentDone);

    const navLoading = nav === undefined;
    const navError = nav === null;
    const isLastModule = !!nav && !nav.nextModuleId;
    const hasNextModule = !!nav && !!nav.nextModuleId;

    const moduleDone = moduleComplete || Boolean((progress as any)?.moduleCompleted);
    const canGetCertificate = isLastModule && (unlockAll || moduleDone);

    async function handleAssignmentClick() {
        const returnToCurrentModule = `/${locale}/${ROUTES.learningPath(
            encodeURIComponent(subjectSlug),
            encodeURIComponent(moduleId)
        )}`;

        if (assignmentSessionId && assignmentStatus.phase !== "idle") {
            router.push(
                `/${ROUTES.practicePath(
                    encodeURIComponent(subjectSlug),
                    encodeURIComponent(moduleId)
                )}` +
                `?sessionId=${encodeURIComponent(assignmentSessionId)}` +
                `&returnTo=${encodeURIComponent(returnToCurrentModule)}`
            );
            return;
        }

        const moduleSlug = (mod as any).practiceSectionSlug ?? moduleId;

        const r = await fetch(`/api/modules/${encodeURIComponent(moduleSlug)}/practice/start`, {
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
                encodeURIComponent(moduleId)
            )}` +
            `?sessionId=${encodeURIComponent(newSid)}` +
            `&returnTo=${encodeURIComponent(returnToCurrentModule)}`
        );
    }

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pending, setPending] = useState<null | { kind: "module" | "topic"; tid?: string }>(
        null
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

    function cancelPendingChange() {
        setConfirmOpen(false);
        setPending(null);
    }

    function applyPendingChange() {
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
    }

    function requestResetModule() {
        setPending({ kind: "module" });
        setConfirmOpen(true);
    }

    function requestResetTopic(tid: string) {
        if (!tid) return;
        setPending({ kind: "topic", tid });
        setConfirmOpen(true);
    }

    const mainScrollRef = useRef<HTMLElement | null>(null);
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const apply = () => setReduceMotion(Boolean(mq.matches));
        apply();

        if (mq.addEventListener) mq.addEventListener("change", apply);
        else (mq as any).addListener?.(apply);

        return () => {
            if (mq.removeEventListener) mq.removeEventListener("change", apply);
            else (mq as any).removeListener?.(apply);
        };
    }, []);

    // ✅ breakpoint-driven layout
    const mdUp = useMediaQuery("(min-width: 768px)");
    const lgUp = useMediaQuery("(min-width: 1024px)");

    const showDesktopLeft = mdUp;

    /**
     * ✅ TOOLS: desktop-only switch (easy to flip later)
     * - current requirement: phone + tablet => NO tools UI
     * - desktop => tools UI
     */
    const TOOLS_DESKTOP_ONLY = true;

// ✅ tools UI is allowed on desktop regardless of codeEnabled (notes still works)
    const toolsUiEnabled = TOOLS_DESKTOP_ONLY ? lgUp : mdUp;

// ✅ right panel exists ONLY when tools UI is enabled
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
        []
    );

    useEffect(() => {
        cardElRef.current.clear();
    }, [viewTid, topicRenderKey]);

    function isQuizLikeCard(c: ReviewCard) {
        return c.type === "quiz" || c.type === "project";
    }

    function isCardDone(c: ReviewCard, tp0: any) {
        if (isQuizLikeCard(c)) return Boolean(tp0?.quizzesDone?.[c.id]);
        return Boolean(tp0?.cardsDone?.[c.id]);
    }

    function userIsInteracting() {
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
    }

    function visibleRatio(el: HTMLElement, container: HTMLElement) {
        const r = el.getBoundingClientRect();
        const c = container.getBoundingClientRect();

        const top = Math.max(r.top, c.top);
        const bot = Math.min(r.bottom, c.bottom);
        const visPx = Math.max(0, bot - top);
        const h = Math.max(1, r.height);

        return visPx / h;
    }

    function focusPrimaryAction(root: HTMLElement) {
        const preferred =
            root.querySelector<HTMLElement>(
                'button[data-flow-focus]:not([disabled]),' +
                'input[data-flow-focus]:not([disabled]),' +
                'textarea[data-flow-focus]:not([disabled]),' +
                'select[data-flow-focus]:not([disabled]),' +
                '[tabindex][data-flow-focus]:not([tabindex="-1"])'
            ) ??
            root.querySelector<HTMLElement>("button.ui-quiz-action--primary:not([disabled])") ??
            root.querySelector<HTMLElement>("button.ui-btn-primary:not([disabled])") ??
            root.querySelector<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );

        preferred?.focus({ preventScroll: true } as any);
    }

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
        [reduceMotion]
    );
// add near scrollToCardId / scroll helpers
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

            // if everything is done, land near the end instead of jumping to top
            return viewCards[viewCards.length - 1]?.id ?? null;
        },
        [viewTid, viewCards, unlockAll]
    );



    function scrollToNextActionable(fromIndex: number, nextProgress: any) {
        const tp0 = nextProgress?.topics?.[viewTid] ?? {};
        const prereqsAllQuizzes = unlockAll ? true : prereqsMetForAnyQuizOrProject(viewCards, tp0);

        for (let i = fromIndex + 1; i < viewCards.length; i++) {
            const c = viewCards[i];
            if (isCardDone(c, tp0)) continue;
            if (isQuizLikeCard(c) && !prereqsAllQuizzes) continue;

            requestAnimationFrame(() => scrollToCardId(c.id));
            return;
        }
    }

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

    function goToTopic(tid: string) {
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
    }

    function goPrevTopic() {
        if (!prevTopic?.id) return;
        goToTopic(prevTopic.id);
    }

    function goNextTopic() {
        if (!nextTopic?.id) return;
        goToTopic(nextTopic.id);
    }

    const commitProgress = React.useCallback(
        (updater: (p: any) => any) => {
            setProgress((p: any) => {
                const next = updater(p);
                queueMicrotask(() => flushNow(next));
                return next;
            });
        },
        [setProgress, flushNow]
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

    const swapKey = `${subjectSlug}:${moduleId}:${locale}:${viewTid}:${versionStr}`;

    const showSkeleton = useSkeletonGate({
        ready: progressHydrated,
        swapKey,
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
    // add this effect AFTER showSkeleton/swapKey are defined,
// and AFTER scrollToCardId is defined
    useEffect(() => {
        if (!progressHydrated) return;
        if (showSkeleton) return;
        if (!viewTid) return;
        if (userIsInteracting()) return;

        const restoreKey = `${swapKey}:restore`;
        if (restoreActivityKeyRef.current === restoreKey) return;
        restoreActivityKeyRef.current = restoreKey;

        const targetId = findCurrentActivityCardId(progress);
        if (!targetId) return;

        const run = () => scrollToCardId(targetId);

        // wait for DOM + skeleton swap to finish
        requestAnimationFrame(() => {
            requestAnimationFrame(run);
        });
    }, [
        progressHydrated,
        showSkeleton,
        swapKey,
        viewTid,
        progress,
        findCurrentActivityCardId,
        scrollToCardId,
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
        paddingBottom:  undefined,
        scrollPaddingBottom: footerPad || undefined,
        ["--flow-bottom-inset" as any]: `${footerPad || 0}px`,
    } as React.CSSProperties;

    // ✅ Build the full page content once, then optionally wrap with ReviewToolsProvider (desktop only).
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

            {/* ✅ mobile topics drawer */}
            <MobileDrawer
                open={mobileTopicsOpen}
                side="left"
                title="Topics"
                reduceMotion={reduceMotion}
                onClose={() => setMobileTopicsOpen(false)}
            >
                <div className="p-3" style={padStyle}>
                    <ModuleSidebar
                        progressHydrated={progressHydrated}
                        mod={mod}
                        topics={topics}
                        progress={progress}
                        activeIdx={activeIdx}
                        activeTopicId={activeTopicId}
                        viewTopicId={viewTopicId}
                        unlockAll={unlockAll}
                        moduleProgress={moduleProgress}
                        topicUnlocked={topicUnlocked}
                        onGoToTopic={(tid) => {
                            goToTopic(tid);
                            setMobileTopicsOpen(false);
                        }}
                        onResetModule={requestResetModule}
                        onCollapse={() => setMobileTopicsOpen(false)}
                        assignmentPct={assignmentRightPct}          // ✅ green = right
                        assignmentMissedPct={assignmentMissedPct}  // ✅ red = missed
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
                                            {/* Topics */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (showDesktopLeft) panels.setLeftCollapsed((v) => !v);
                                                    else setMobileTopicsOpen(true);
                                                }}
                                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                                title="Topics"
                                            >
                                                {showDesktopLeft
                                                    ? panels.leftCollapsed
                                                        ? "Topics ▶"
                                                        : "Topics ◀"
                                                    : "Topics"}
                                            </button>

                                            {/* ✅ Tools button: desktop-only */}
                                            {toolsUiEnabled ? (
                                                <button
                                                    type="button"
                                                    onClick={() => panels.setRightCollapsed((v) => !v)}
                                                    className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                                    title="Tools"
                                                >
                                                    {panels.rightCollapsed ? "Tools ▶" : "Tools ◀"}
                                                </button>
                                            ) : null}

                                            <button
                                                type="button"
                                                onClick={() => requestResetTopic(viewTid)}
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

                            <div className="flex-1 min-h-0 w-full ">
                                <div className="h-full min-h-0 flex">
                                    {/* LEFT (desktop only) */}
                                    {showDesktopLeft ? (
                                        <>
                                            <aside
                                                className={cn(
                                                    "min-h-0 transition-[width] duration-300 ease-out overflow-hidden",
                                                    panels.leftCollapsed && "w-0"
                                                )}
                                                style={{ width: panels.leftCollapsed ? 0 : panels.leftW }}
                                            >
                                                <div className="h-full min-h-0 overflow-auto" style={padStyle}>
                                                    <ModuleSidebar
                                                        progressHydrated={progressHydrated}
                                                        mod={mod}
                                                        topics={topics}
                                                        progress={progress}
                                                        activeIdx={activeIdx}
                                                        activeTopicId={activeTopicId}
                                                        viewTopicId={viewTopicId}
                                                        unlockAll={unlockAll}
                                                        moduleProgress={moduleProgress}
                                                        topicUnlocked={topicUnlocked}
                                                        onGoToTopic={goToTopic}
                                                        onResetModule={requestResetModule}
                                                        onCollapse={() => panels.setLeftCollapsed(true)}
                                                        assignmentPct={assignmentRightPct}          // ✅ green = right
                                                        assignmentMissedPct={assignmentMissedPct}  // ✅ red = missed
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

                                    {/* MAIN (SCROLLER) */}
                                    <main
                                        ref={mainScrollRef}
                                        className="flex-1 min-w-0 min-h-0 overflow-auto"
                                        style={padStyle}
                                    >
                                        {leftCollapsedEff ? (
                                            <div className="mb-3 flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (showDesktopLeft) panels.setLeftCollapsed(false);
                                                        else setMobileTopicsOpen(true);
                                                    }}
                                                    className="ui-btn ui-btn-secondary text-xs font-extrabold"
                                                >
                                                    Topics ▶
                                                </button>

                                                {/* ✅ no mobile tools button */}
                                            </div>
                                        ) : null}

                                        <TopicShell title={viewTopic?.label ?? ""} subtitle={viewTopic?.summary ?? null}>
                                            <div key={topicRenderKey} className="grid gap-3">
                                                {viewCards.map((card: any, cardIndex: number) => {
                                                    const savedQuiz = (tp?.quizState?.[card.id] ?? null) as SavedQuizState | null;
                                                    const savedSketch = tp?.sketchState?.[card.id] ?? null;

                                                    const isQuizLike = card.type === "quiz" || card.type === "project";
                                                    const done = isQuizLike
                                                        ? Boolean(tp?.quizzesDone?.[card.id])
                                                        : Boolean(tp?.cardsDone?.[card.id]);

                                                    const prereqsMet = isQuizLike ? prereqsForAllQuizzes : true;

                                                    return (
                                                        <div key={card.id} ref={setCardEl(card.id)}>
                                                            <CardRenderer
                                                                card={card}
                                                                done={done}
                                                                cardIndex={cardIndex}
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
                                                                        const tp0: any = p.topics?.[viewTid] ?? {};
                                                                        const cardsDone = { ...(tp0.cardsDone ?? {}), [card.id]: true };
                                                                        const next = {
                                                                            ...p,
                                                                            topics: { ...(p.topics ?? {}), [viewTid]: { ...tp0, cardsDone } },
                                                                        };

                                                                        queueMicrotask(() => {
                                                                            flushNow(next);
                                                                            scrollToNextActionable(cardIndex, next);
                                                                        });

                                                                        return next;
                                                                    });
                                                                }}
                                                                onQuizPass={(quizId) => {
                                                                    setProgress((p: any) => {
                                                                        const tp0: any = p.topics?.[viewTid] ?? {};
                                                                        const quizzesDone = { ...(tp0.quizzesDone ?? {}), [quizId]: true };
                                                                        const next = {
                                                                            ...p,
                                                                            topics: { ...(p.topics ?? {}), [viewTid]: { ...tp0, quizzesDone } },
                                                                        };

                                                                        queueMicrotask(() => {
                                                                            flushNow(next);
                                                                            scrollToNextActionable(cardIndex, next);
                                                                        });

                                                                        return next;
                                                                    });
                                                                }}
                                                                onQuizStateChange={(quizCardId, s) => {
                                                                    setProgress((p: any) => {
                                                                        const tp0: any = p.topics?.[viewTid] ?? {};
                                                                        const quizState = { ...(tp0.quizState ?? {}), [quizCardId]: s };
                                                                        return {
                                                                            ...p,
                                                                            topics: { ...(p.topics ?? {}), [viewTid]: { ...tp0, quizState } },
                                                                        };
                                                                    });
                                                                }}
                                                                onQuizReset={(quizCardId) => {
                                                                    commitProgress((p) => {
                                                                        const tp0: any = p.topics?.[viewTid] ?? {};
                                                                        const nextQuizState = { ...(tp0.quizState ?? {}) };
                                                                        delete nextQuizState[quizCardId];

                                                                        const nextQuizzesDone = { ...(tp0.quizzesDone ?? {}) };
                                                                        delete nextQuizzesDone[quizCardId];

                                                                        return {
                                                                            ...p,
                                                                            topics: {
                                                                                ...(p.topics ?? {}),
                                                                                [viewTid]: {
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
                                                })}
                                            </div>

                                            {viewIsComplete ? (
                                                <div className="mt-3">
                                                    <TopicOutro
                                                        topic={viewTopic}
                                                        onContinue={nextTopic?.id ? goNextTopic : undefined}
                                                    />
                                                </div>
                                            ) : null}
                                        </TopicShell>

                                        {isLastModule ? (
                                            <div className="mt-3  border border-emerald-600/25 bg-emerald-500/10 p-3 text-xs dark:border-emerald-300/30 dark:bg-emerald-300/10">
                                                <div className="font-black text-emerald-900 dark:text-emerald-100">
                                                    Course complete
                                                </div>
                                                <div className="mt-1 text-emerald-900/80 dark:text-emerald-100/80">
                                                    Download your certificate when ready.
                                                </div>

                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "mt-3 ui-btn ui-btn-primary w-full",
                                                        !canGetCertificate && "opacity-60 cursor-not-allowed"
                                                    )}
                                                    disabled={!canGetCertificate}
                                                    onClick={() =>
                                                        router.push(
                                                            `/subjects/${encodeURIComponent(subjectSlug)}/certificate`
                                                        )
                                                    }
                                                >
                                                    Get certificate →
                                                </button>
                                            </div>
                                        ) : null}
                                    </main>

                                    {/* RIGHT (desktop-only tools) */}
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
                                                    panels.rightCollapsed && "w-0"
                                                )}
                                                style={{ width: panels.rightCollapsed ? 0 : panels.rightW }}
                                            >
                                                <ToolsPanel
                                                    onCollapse={() => panels.setRightCollapsed(true)}
                                                    onUnbind={tool.unbindCodeInput}
                                                    boundId={tool.boundId}
                                                    rightBodyRef={tool.rightBodyRef}
                                                    codeRunnerRegionH={tool.codeRunnerRegionH}
                                                    toolLang={tool.toolLang as CodeLanguage}
                                                    toolCode={tool.toolCode}
                                                    toolStdin={tool.toolStdin}
                                                    onChangeLang={handleToolChangeLang}
                                                    onChangeCode={handleToolChangeCode}
                                                    onChangeStdin={handleToolChangeStdin}
                                                    onBeforeRun={tool.flushLatest}
                                                    subjectSlug={subjectSlug}
                                                    moduleId={moduleId}
                                                    locale={locale}
                                                    codeEnabled={codeEnabled}
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

    // ✅ If tools are disabled (phone/tablet), don't mount the provider at all.
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