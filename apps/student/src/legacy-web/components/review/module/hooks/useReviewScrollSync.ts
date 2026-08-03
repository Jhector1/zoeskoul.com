import { useCallback, useEffect, useRef } from "react";
import type { ReviewCard } from "@/lib/subjects/types";
import { isCardDoneFromState, isQuizLikeCard } from "../progressKeys";
import { prereqsMetForAnyQuizOrProject } from "../utils";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { scrollIntoViewSmart } from "@/lib/ui/flowScroll";

type Args = {
    subjectSlug: string;
    moduleSlug: string;
    topicMotionKey: string;
    viewTid: string;
    viewCards: ReviewCard[];
    progress: any;
    progressHydrated: boolean;
    navModes: { cards: "scroll" | "slideshow"; quiz: "scroll" | "slideshow" };
    reduceMotion: boolean;
    unlockAll: boolean;
    showSkeleton: boolean;
    routeOwned?: boolean;
    onNavigateToCardIndex?: (
        index: number,
        options?: { bypassProgressiveLock?: boolean },
    ) => void;};

export function useReviewScrollSync({
                                        subjectSlug,
                                        moduleSlug,
                                        topicMotionKey,
                                        viewTid,
                                        viewCards,
                                        progress,
                                        progressHydrated,
                                        navModes,
                                        reduceMotion,
                                        unlockAll,
                                        showSkeleton,
                                        routeOwned = false,
                                        onNavigateToCardIndex,
                                    }: Args) {
    const activeCardIndex = useReviewRuntimeStore((s) => s.activeCardIndex);
    const setActiveCardIndex = useReviewRuntimeStore((s) => s.goToCard);

    const restoreActivityKeyRef = useRef<string>("");
    const mainScrollRef = useRef<HTMLElement | null>(null);
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

    const isCardDone = useCallback((c: ReviewCard, tp0: any) => {
        return isCardDoneFromState(c, tp0);
    }, []);

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
                : prereqsMetForAnyQuizOrProject(viewCards, tp0, viewTid);

            for (const c of viewCards) {
                if (isCardDone(c, tp0)) continue;
                if (isQuizLikeCard(c) && !prereqsAllQuizzes) continue;
                return c.id;
            }

            return viewCards[viewCards.length - 1]?.id ?? null;
        },
        [viewTid, viewCards, unlockAll, isCardDone],
    );

    const findCurrentActivityCardIndex = useCallback(
        (state: any) => {
            const id = findCurrentActivityCardId(state);
            const idx = viewCards.findIndex((c: any) => c.id === id);
            return idx < 0 ? 0 : idx;
        },
        [findCurrentActivityCardId, viewCards],
    );

    const scrollToTopicCompletion = useCallback(() => {
        if (typeof document === "undefined") return;

        let attempts = 0;
        const maxAttempts = 24;

        const tryScroll = () => {
            const target = document.querySelector<HTMLElement>(
                '[data-review-topic-completion="true"]',
            );

            if (target) {
                scrollIntoViewSmart(target, {
                    reduceMotion,
                    block: "start",
                    force: true,
                    offsetPx: 16,
                    focus: true,
                    focusSelector: '[data-review-next-topic="true"]',
                });
                return;
            }

            attempts += 1;
            if (attempts < maxAttempts) requestAnimationFrame(tryScroll);
        };

        requestAnimationFrame(tryScroll);
    }, [reduceMotion]);

    const findNextActionableCardIndex = useCallback(
        (fromIndex: number, nextProgress: any) => {
            const tp0 = nextProgress?.topics?.[viewTid] ?? {};
            const prereqsAllQuizzes = unlockAll
                ? true
                : prereqsMetForAnyQuizOrProject(viewCards, tp0, viewTid);

            for (let i = fromIndex + 1; i < viewCards.length; i++) {
                const c = viewCards[i];
                if (isCardDone(c, tp0)) continue;
                if (isQuizLikeCard(c) && !prereqsAllQuizzes) continue;
                return i;
            }

            return -1;
        },
        [viewTid, unlockAll, viewCards, isCardDone],
    );

    const scrollToNextActionable = useCallback(
        (fromIndex: number, nextProgress: any) => {
            const nextIndex = findNextActionableCardIndex(fromIndex, nextProgress);
            if (nextIndex < 0) {
                scrollToTopicCompletion();
                return;
            }

            if (navModes.cards === "slideshow") {
                if (routeOwned && onNavigateToCardIndex) {
                    onNavigateToCardIndex(nextIndex, {
                        bypassProgressiveLock: true,
                    });
                    return;
                }
                setActiveCardIndex(nextIndex);
                return;
            }

            const nextCard = viewCards[nextIndex];
            if (!nextCard) return;
            requestAnimationFrame(() => scrollToCardId(nextCard.id));
        },
        [
            findNextActionableCardIndex,
            navModes.cards,
            onNavigateToCardIndex,
            routeOwned,
            setActiveCardIndex,
            viewCards,
            scrollToCardId,
            scrollToTopicCompletion,
        ],
    );

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
        if (!progressHydrated) return;
        if (showSkeleton) return;
        if (!viewTid) return;
        if (routeOwned) return;
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
        routeOwned,
        setActiveCardIndex,
        userIsInteracting,
    ]);

    return {
        activeCardIndex,
        setActiveCardIndex,
        mainScrollRef,
        setCardEl,
        scrollToNextActionable,
    };
}
