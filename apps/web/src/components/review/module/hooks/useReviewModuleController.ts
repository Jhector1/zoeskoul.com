import React, {useCallback, useEffect, useMemo, useRef, useState, useTransition} from "react";
import {useParams, usePathname} from "next/navigation";
import {useRouter} from "@/i18n/navigation";

import type {ReviewProgressState} from "@/lib/subjects/progressTypes";

import {ROUTES} from "@/utils";

import {useReviewProgress} from "@/components/review/module/hooks/useReviewProgress";
import {useAssignmentStatus} from "@/components/review/module/hooks/useAssignmentStatus";
import {
    useModuleNav,
    type CourseModuleNavItem,
} from "@/components/review/module/hooks/useModuleNav";
import {useDebouncedSketchState} from "../hooks/useDebouncedSketchState";
import {useToolCodeRunnerState} from "../hooks/useToolCodeRunnerState";
import {useSkeletonGate} from "@/components/review/module/hooks/useSkeletonGate";
import {useReduceMotion} from "../hooks/useReduceMotion";
import {useSubjectFinish} from "../hooks/useSubjectFinish";
import {useGamificationSummary} from "@/components/review/module/hooks/useGamificationSummary";

import {useReviewModuleRuntime} from "./useReviewModuleRuntime";
import {useReviewTopicFlow} from "./useReviewTopicFlow";
import {useReviewCelebrations} from "./useReviewCelebrations";
import {useReviewReset} from "./useReviewReset";
import {useReviewScrollSync} from "./useReviewScrollSync";
import {useReviewPanels} from "./useReviewPanels";

import {prereqsMetForAnyQuizOrProject, isTopicComplete} from "../utils";
import {
    canAutoMarkReadingCardDone,
    getEmbeddedTryIt,
    hasRequiredEmbeddedTryIt,
    isCardDoneFromState,
    isQuizLikeCard,
} from "../progressKeys";
import {
    getModuleProgress,
    getSidebarTopicItems,
    getViewCards,
    getViewTopic,
    moduleCompleteFromProgress,
} from "../selectors";
import {
    buildQuizResetProgress,
    buildMarkCardDoneProgress,
    buildModuleCompletedProgress,
    buildNormalizedTopicsProgress,
    buildTopicCompletedProgress,
    type QuizResetTarget,
} from "../actions";



import type {ReviewModulePageProps, HeaderGamificationVm} from "../types";
import {useReviewRuntimeStore} from "../runtime/reviewRuntimeStore";
import { mergeRuntimeIntoProgress } from "../runtime/runtimeProgressBridge";
import {
    buildReviewCardRouteTarget,
    buildReviewExerciseRouteTarget,
    parseReviewRouteFromPath,
    applyReviewRoutePrefix,
    buildReviewRoutePath,
    removeReviewRoutePrefix,
    resolveReviewRouteTarget,
    type ReviewResolvedRouteTarget,
} from "../runtime/reviewRoute";

import {buildReviewTargetRegistry} from "../runtime/reviewTargetRegistry";
import {resolveFlowNavigationConfig} from "@/components/review/navigation/FlowNavigator";
import {useTaggedT} from "@/i18n/tagged";
import {
    computeProgressiveUnlock, firstRouteTargetForUnlockedTopic,
    getTargetKeyForRouteTarget, maxUnlockedCardIndexForTopic
} from "@/components/review/module/runtime/progressiveUnlock";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";
import {resolveRightRailSqlProps} from "../runtime/resolveRightRailSqlProps";
import { resolveTopicStageRuntimeDefaults } from "../runtime/topicStageRuntimeDefaults";
import { shouldUseWorkspaceCodeSurface } from "@/components/practice/workspaceExercise";
import { resolveRightRailIdeConfig } from "./rightRailIdeConfig";
import { buildBillingHref } from "@/lib/billing/moduleAccess";
import { buildModulePracticeHref } from "@/lib/practice/experience/modulePracticeHref";
import { clearReviewWorkspaceDrafts } from "@/components/tools/panes/reviewWorkspaceDrafts";
import {
    cardHasAuthoredExerciseSurface,
    shouldRightRailUseBoundExercise,
} from "./rightRailExerciseBinding";
import { resolveActiveToolScopeKey } from "./activeToolScopeKey";
import { resolveCompactAssignmentCtaVisibility } from "../assignmentCtaVisibility";
import {
    COMPACT_PRACTICE_NAV_LABEL,
    isAtFinalModuleNavigationStep,
    type CompactQuizNavigationState,
} from "../compactFlowNavigation";
import { shouldShowFinalCertificateCta } from "../certificateNavigation";
import {
    resolveToolsRailVisibility,
    shouldDefaultCollapseToolsRail,
    toolPresentationPolicyFromManifest,
} from "../toolsRailVisibility";

function normalizeCompactNavKind(value: unknown) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ");
}

function compactCardDestinationLabel(card: unknown) {
    const record = (card && typeof card === "object" ? card : {}) as {
        type?: unknown;
        id?: unknown;
        title?: unknown;
        spec?: Record<string, unknown> | null;
    };
    const spec =
        record.spec && typeof record.spec === "object"
            ? record.spec
            : {};
    const kindText = [
        record.type,
        record.id,
        record.title,
        spec.uiKind,
        spec.displayKind,
        spec.mode,
        spec.topic,
        spec.section,
    ]
        .map(normalizeCompactNavKind)
        .filter(Boolean)
        .join(" ");

    if (kindText.includes("capstone") || kindText.includes("final project")) {
        return "Capstone";
    }

    if (record.type === "project") {
        if (kindText.includes("module project")) return "Module project";
        return "Project";
    }

    if (record.type === "quiz") return "Quiz";

    if (hasRequiredEmbeddedTryIt(card as any)) return COMPACT_PRACTICE_NAV_LABEL;

    return "Next";
}

const REVIEW_ROUTE_HISTORY_STATE_KEY = "__zoeReviewRoute";

function sameReviewResolvedRouteTarget(
    left: ReviewResolvedRouteTarget | null | undefined,
    right: ReviewResolvedRouteTarget | null | undefined,
) {
    if (left === right) return true;
    if (!left || !right) return false;

    return (
        left.kind === right.kind &&
        left.topicId === right.topicId &&
        left.cardId === right.cardId &&
        left.targetKind === right.targetKind &&
        left.targetSlug === right.targetSlug &&
        (left.kind !== "exercise" ||
            right.kind !== "exercise" ||
            left.exerciseStateKey === right.exerciseStateKey)
    );
}

function buildReviewRouteHistoryState(
    existingState: unknown,
    args: {
        href: string;
        targetKey: string | null;
        subjectSlug: string;
        moduleSlug: string;
    },
) {
    const base =
        existingState && typeof existingState === "object" && !Array.isArray(existingState)
            ? (existingState as Record<string, unknown>)
            : {};

    return {
        ...base,
        [REVIEW_ROUTE_HISTORY_STATE_KEY]: {
            href: args.href,
            targetKey: args.targetKey,
            subjectSlug: args.subjectSlug,
            moduleSlug: args.moduleSlug,
        },
    };
}

function readReviewRouteHistoryTargetKey() {
    if (typeof window === "undefined") return null;

    const state = window.history.state;
    if (!state || typeof state !== "object") return null;

    const reviewState = (state as Record<string, unknown>)[REVIEW_ROUTE_HISTORY_STATE_KEY];
    if (!reviewState || typeof reviewState !== "object") return null;

    const targetKey = (reviewState as Record<string, unknown>).targetKey;
    return typeof targetKey === "string" && targetKey ? targetKey : null;
}
function lastExerciseIdSegment(value: unknown) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";

    const parts = raw.split(/[.:/]/).filter(Boolean);
    return parts[parts.length - 1] ?? raw;
}

function pickRouteExerciseId(args: {
    activeRouteTarget: ReviewResolvedRouteTarget | null;
    ownerCardId: string;
    inputId: string;
    targetExerciseKey: string;
}) {
    const { activeRouteTarget, ownerCardId, inputId, targetExerciseKey } = args;

    const activeExerciseRoute =
        activeRouteTarget?.kind === "exercise" ? activeRouteTarget : null;

    if (
        activeExerciseRoute &&
        activeExerciseRoute.cardId === ownerCardId &&
        activeExerciseRoute.exerciseId
    ) {
        return activeExerciseRoute.exerciseId;
    }

    const rawInput = inputId && !inputId.includes(":") ? inputId : "";
    if (rawInput) return rawInput;

    const rawTarget =
        targetExerciseKey && !targetExerciseKey.includes(":")
            ? targetExerciseKey
            : "";
    if (rawTarget) return rawTarget;

    return (
        lastExerciseIdSegment(inputId) ||
        lastExerciseIdSegment(targetExerciseKey) ||
        inputId ||
        targetExerciseKey
    );
}

function registryEntryToRouteTarget(entry: any): ReviewResolvedRouteTarget | null {
    if (!entry) return null;

    if (entry.ownerKind === "exercise" && entry.exerciseId && entry.exerciseStateKey) {
        return {
            kind: "exercise",
            sectionSlug: entry.sectionSlug,
            topicId: entry.topicId,
            topicSlug: entry.topicSlug,
            cardId: entry.cardId,
            cardType: entry.cardType,
            targetKind: "exercise",
            targetSlug: entry.targetSlug,
            exerciseId: entry.exerciseId,
            exerciseStateKey: entry.exerciseStateKey,
        };
    }

    return {
        kind: "card",
        sectionSlug: entry.sectionSlug,
        topicId: entry.topicId,
        topicSlug: entry.topicSlug,
        cardId: entry.cardId,
        cardType: entry.cardType,
        targetKind: entry.targetKind,
        targetSlug: entry.targetSlug,
    };
}

type NavigateToResolvedTargetOptions = {
    bypassProgressiveLock?: boolean;
};

export function useReviewModuleController({
                                              mod,
                                              canUnlockAll = false,
                                              footerInsetPx = 0,
                                              navigationMode,
                                              routePrefix = null,
                                              tutoringSession = null,
                                          }: ReviewModulePageProps) {
    const params = useParams<{
        locale: string;
        catalogSlug?: string;
        subjectSlug: string;
        moduleSlug: string;
        sectionSlug?: string;
        topicId?: string;
        topicSlug?: string;
        targetKind?: string;
        targetSlug?: string;
    }>();
    const router = useRouter();
    const pathname = usePathname();
    const locale = params?.locale ?? "en";
    const catalogSlug = params?.catalogSlug ?? null;
    const subjectSlug = params?.subjectSlug ?? "";
    const moduleSlug = params?.moduleSlug ?? "";
    const sectionSlug = (params as any)?.sectionSlug;
    const tutoringSessionId = tutoringSession?.id ?? null;
    const isTutoringSession = Boolean(tutoringSessionId);
    const tutoringProgressEndpoint = tutoringSessionId
        ? `/api/tutoring-sessions/${encodeURIComponent(tutoringSessionId)}/progress`
        : undefined;
    const tutoringDocumentEndpoint = tutoringSessionId
        ? `/api/tutoring-sessions/${encodeURIComponent(tutoringSessionId)}/documents`
        : undefined;
    const unlockAll = Boolean(canUnlockAll);
    const compactModeActive =
        learnerUiFlags.compactLearnerUi && !learnerUiFlags.showDebugLearningUi;
    const routeFamilyRef = useRef<"devReviewClone" | "standard">(
        pathname?.includes("/dev/e2e/review-module-clone/")
            ? "devReviewClone"
            : "standard",
    );

    const buildRoutePathForCurrentSurface = useCallback(
        (target: ReviewResolvedRouteTarget) => {
            if (routeFamilyRef.current === "devReviewClone") {
                return (
                    `/${encodeURIComponent(locale)}` +
                    `/dev/e2e/review-module-clone` +
                    `/${encodeURIComponent(subjectSlug)}` +
                    `/${encodeURIComponent(moduleSlug)}` +
                    `/learn` +
                    `/${encodeURIComponent(target.sectionSlug)}` +
                    `/${encodeURIComponent(target.topicSlug)}` +
                    `/${encodeURIComponent(target.targetKind)}` +
                    `/${encodeURIComponent(target.targetSlug)}`
                );
            }

            const standardPath = buildReviewRoutePath({
                locale,
                catalogSlug,
                subjectSlug,
                moduleSlug,
                target,
            });
            return applyReviewRoutePrefix({
                standardPath,
                locale,
                routePrefix,
            });
        },
        [catalogSlug, locale, moduleSlug, routePrefix, subjectSlug],
    );
    const resolvedNavModes = useMemo(
        () => resolveFlowNavigationConfig(navigationMode),
        [navigationMode],
    );

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
        flush,
        saveStatus,
        lastSaveError,
    } = useReviewProgress({
        subjectSlug,
        moduleSlug,
        locale,
        firstTopicId,
        endpoint: tutoringProgressEndpoint,
        gamificationEnabled: !isTutoringSession,
    });

    const store = useReviewRuntimeStore();
    const flushToolLatestRef = useRef<null | (() => Promise<void>)>(null);

    const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
    const routeTransitionTimerRef = useRef<number | null>(null);

    const beginRouteTransition = useCallback(() => {
        if (typeof window !== "undefined" && routeTransitionTimerRef.current !== null) {
            window.clearTimeout(routeTransitionTimerRef.current);
            routeTransitionTimerRef.current = null;
        }

        setIsRouteTransitioning(true);
    }, []);

    const finishRouteTransition = useCallback(() => {
        if (typeof window === "undefined") {
            setIsRouteTransitioning(false);
            return;
        }

        if (routeTransitionTimerRef.current !== null) {
            window.clearTimeout(routeTransitionTimerRef.current);
        }

        routeTransitionTimerRef.current = window.setTimeout(() => {
            setIsRouteTransitioning(false);
            routeTransitionTimerRef.current = null;
        }, 180);
    }, []);

    useEffect(() => {
        return () => {
            if (typeof window !== "undefined" && routeTransitionTimerRef.current !== null) {
                window.clearTimeout(routeTransitionTimerRef.current);
            }
        };
    }, []);

    const taggedMessages = useTaggedT();
    const resolveReviewMessageRef = useRef(taggedMessages.resolve);

    useEffect(() => {
        resolveReviewMessageRef.current = taggedMessages.resolve;
    }, [taggedMessages.resolve]);

    const resolveReviewMessage = useCallback((key: string) => {
        const taggedKey = key.startsWith("@:") ? key : `@:${key}`;
        const resolved = resolveReviewMessageRef.current(taggedKey);

        if (!resolved) return undefined;

        const trimmed = String(resolved).trim();

        /**
         * In dev/missing-message cases useTaggedT can return the unresolved key.
         * Never treat that as executable starter code.
         */
        if (
            trimmed === key ||
            trimmed === taggedKey ||
            trimmed.endsWith(".starterCode")
        ) {
            return undefined;
        }

        return resolved;
    }, []);

    const targetRegistry = useMemo(() => {
        if (!mod) return null;
        return buildReviewTargetRegistry({
            mod,
            subjectSlug,
            moduleSlug,
            resolveMessage: resolveReviewMessage,
        });
    }, [mod, moduleSlug, subjectSlug, resolveReviewMessage]);

    useEffect(() => {
        if (!targetRegistry) return;

        const runtimeStore = useReviewRuntimeStore.getState();
        runtimeStore.setTargetRegistry(targetRegistry);
    }, [targetRegistry]);
    const flushAll = useCallback(async () => {
        store.flushToolSnapshot();

        await flushToolLatestRef.current?.();

        store.flushToolSnapshot();

        await flush();
    }, [store, flush]);

    const initialRouteTarget = useMemo<ReviewResolvedRouteTarget | null>(() => {
        const resolved = resolveReviewRouteTarget({
            mod,
            subjectSlug,
            moduleSlug,
            route: {
                sectionSlug: params?.sectionSlug,
                topicId: params?.topicId,
                topicSlug: params?.topicSlug,
                targetKind: params?.targetKind,
                targetSlug: params?.targetSlug,
            },
        });
        if (resolved) return resolved;

        if (targetRegistry && params?.sectionSlug && params?.topicSlug && params?.targetKind && params?.targetSlug) {
            const routeKey = `${params.sectionSlug}/${params.topicSlug}/${params.targetKind}/${params.targetSlug}`;
            const targetKey = targetRegistry.byRoute[routeKey];
            if (targetKey) {
                const entry = targetRegistry.byKey[targetKey];
                if (entry) {
                    const direct = registryEntryToRouteTarget(entry);
                    if (direct) return direct;
                }
            }
        }

        return null;
    }, [
        mod,
        moduleSlug,
        params?.sectionSlug,
        params?.targetKind,
        params?.targetSlug,
        params?.topicId,
        params?.topicSlug,
        subjectSlug,
        targetRegistry,
    ]);
    const [routeTarget, setRouteTarget] = useState<ReviewResolvedRouteTarget | null>(initialRouteTarget);
    const routeTargetRef = useRef<ReviewResolvedRouteTarget | null>(initialRouteTarget);

    useEffect(() => {
        setRouteTarget(initialRouteTarget);
    }, [initialRouteTarget]);

    useEffect(() => {
        routeTargetRef.current = routeTarget;
    }, [routeTarget]);

    const routeEditorEntry = useMemo(() => {
        if (!routeTarget || !targetRegistry) return null;
        const routeKey = `${routeTarget.sectionSlug}/${routeTarget.topicSlug}/${routeTarget.targetKind}/${routeTarget.targetSlug}`;
        const targetKey = targetRegistry.byRoute[routeKey];
        return targetKey ? targetRegistry.byKey[targetKey] ?? null : null;
    }, [routeTarget, targetRegistry]);

    const routeEditorOwnerKey = routeEditorEntry?.ownerKey ?? null;
    const routeEditorToolScopeKey = routeEditorEntry?.toolScopeKey ?? routeEditorOwnerKey ?? null;
    const [progressiveLockMessage] = useState<string | null>(null);
    const progressiveUnlock = useMemo(
        () =>
            computeProgressiveUnlock({
                registry: targetRegistry,
                progress,
                progressHydrated,
                unlockAll,
            }),
        [targetRegistry, progress, progressHydrated, unlockAll],
    );

    const trustedProgressiveBypassTargetKeyRef = useRef<string | null>(null);

    const routeTargetKey = useMemo(
        () => getTargetKeyForRouteTarget(targetRegistry, routeTarget),
        [targetRegistry, routeTarget],
    );

    const routeTargetTrustedBypass =
        Boolean(routeTargetKey) &&
        trustedProgressiveBypassTargetKeyRef.current === routeTargetKey;

    const routeTargetUnlocked =
        routeTargetTrustedBypass ||
        unlockAll ||
        !progressHydrated ||
        !routeTargetKey ||
        progressiveUnlock.unlockedTargetKeys.has(routeTargetKey);
    useEffect(() => {
        const trustedKey = trustedProgressiveBypassTargetKeyRef.current;

        if (!trustedKey) return;

        if (progressiveUnlock.unlockedTargetKeys.has(trustedKey)) {
            trustedProgressiveBypassTargetKeyRef.current = null;
        }
    }, [progressiveUnlock.unlockedTargetKeys]);
    const firstUnlockedRouteTarget = useMemo(() => {
        if (!targetRegistry) return null;

        const key = progressiveUnlock.earliestUnlockedTargetKey;
        const entry = key ? targetRegistry.byKey[key] ?? null : null;

        return registryEntryToRouteTarget(entry);
    }, [progressiveUnlock.earliestUnlockedTargetKey, targetRegistry]);

    const showProgressiveLockMessage = useCallback(() => {
        /**
         * Progressive locking is enforced by disabled navigation and route guards.
         * Do not show a large warning during normal learning flow.
         */
    }, []);
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!progressHydrated) return;
        if (!routeTarget) return;
        if (!routeTargetUnlocked) return;

        const normalizedPath = buildRoutePathForCurrentSurface(routeTarget);
        const currentPath = window.location.pathname;
        const targetKey = getTargetKeyForRouteTarget(targetRegistry, routeTarget);
        const nextHistoryState = buildReviewRouteHistoryState(window.history.state, {
            href: normalizedPath,
            targetKey,
            subjectSlug,
            moduleSlug,
        });

        if (currentPath !== normalizedPath) {
            window.history.replaceState(nextHistoryState, "", normalizedPath);
            return;
        }

        if (readReviewRouteHistoryTargetKey() !== targetKey) {
            window.history.replaceState(nextHistoryState, "", normalizedPath);
        }
    }, [
        buildRoutePathForCurrentSurface,
        moduleSlug,
        progressHydrated,
        routeTarget,
        routeTargetUnlocked,
        subjectSlug,
        targetRegistry,
    ]);
    useEffect(() => {
        if (typeof window === "undefined") return;

        const syncFromLocation = () => {
            const nextRoute = parseReviewRouteFromPath({
                pathname: removeReviewRoutePrefix({
                    pathname: window.location.pathname,
                    locale,
                    routePrefix,
                }),
                locale,
                catalogSlug,
                subjectSlug,
                moduleSlug,
            });

            const resolved = resolveReviewRouteTarget({
                mod,
                subjectSlug,
                moduleSlug,
                route: nextRoute ?? {},
            });
            const registryResolved =
                nextRoute && targetRegistry
                    ? registryEntryToRouteTarget(
                        targetRegistry.byKey[
                        targetRegistry.byRoute[
                            `${nextRoute.sectionSlug}/${nextRoute.topicSlug}/${nextRoute.targetKind}/${nextRoute.targetSlug}`
                            ] ?? ""
                            ],
                    )
                    : null;
            let nextResolved = resolved ?? registryResolved;

            const nextTargetKey = getTargetKeyForRouteTarget(targetRegistry, nextResolved);
            const nextTargetTrustedBypass =
                Boolean(nextTargetKey) &&
                trustedProgressiveBypassTargetKeyRef.current === nextTargetKey;

            const browserHistoryTargetKey = readReviewRouteHistoryTargetKey();
            const nextIsBrowserHistoryExercise =
                nextResolved?.kind === "exercise" &&
                Boolean(nextTargetKey) &&
                browserHistoryTargetKey === nextTargetKey;

            if (nextIsBrowserHistoryExercise && nextTargetKey) {
                trustedProgressiveBypassTargetKeyRef.current = nextTargetKey;
            }

            const nextIsUnlocked =
                nextIsBrowserHistoryExercise ||
                nextTargetTrustedBypass ||
                unlockAll ||
                !progressHydrated ||
                !nextTargetKey ||
                progressiveUnlock.unlockedTargetKeys.has(nextTargetKey);

            if (!nextIsUnlocked && firstUnlockedRouteTarget) {
                nextResolved = firstUnlockedRouteTarget;
                const fallbackHref = buildRoutePathForCurrentSurface(firstUnlockedRouteTarget);
                const fallbackTargetKey = getTargetKeyForRouteTarget(
                    targetRegistry,
                    firstUnlockedRouteTarget,
                );

                window.history.replaceState(
                    buildReviewRouteHistoryState(window.history.state, {
                        href: fallbackHref,
                        targetKey: fallbackTargetKey,
                        subjectSlug,
                        moduleSlug,
                    }),
                    "",
                    fallbackHref,
                );
                showProgressiveLockMessage();
            }

            setRouteTarget((prev): ReviewResolvedRouteTarget | null => {
                if (sameReviewResolvedRouteTarget(prev, nextResolved)) {
                    return prev;
                }

                return nextResolved;
            });
        };

        window.addEventListener("popstate", syncFromLocation);
        return () => window.removeEventListener("popstate", syncFromLocation);
    }, [
        buildRoutePathForCurrentSurface,
        catalogSlug,
        firstUnlockedRouteTarget,
        locale,
        mod,
        moduleSlug,
        progressHydrated,
        progressiveUnlock.unlockedTargetKeys,
        routePrefix,
        showProgressiveLockMessage,
        subjectSlug,
        targetRegistry,
        unlockAll,
    ]);

    const effectiveViewTopicId = routeTarget?.topicId ?? viewTopicId;

    const viewTopic = useMemo(
        () => getViewTopic(topics, effectiveViewTopicId),
        [topics, effectiveViewTopicId],
    );

    const viewCards = useMemo(
        () => getViewCards(viewTopic),
        [viewTopic],
    );
    const topicStageRuntimeDefaults = useMemo(
        () =>
            resolveTopicStageRuntimeDefaults({
                mod,
                viewTopic,
                routeSectionSlug: routeTarget?.sectionSlug ?? sectionSlug ?? null,
            }),
        [mod, routeTarget?.sectionSlug, sectionSlug, viewTopic],
    );

    const viewTid = viewTopic?.id ?? effectiveViewTopicId ?? firstTopicId ?? "";

    const runtime = useReviewModuleRuntime({
        subjectSlug,
        mod,
        viewTopic,
    });

    const syncActiveTarget = useReviewRuntimeStore((s) => s.syncActiveTarget);
    useEffect(() => {
        if (!targetRegistry) return;
        if (!progressHydrated) return;
        if (!routeTargetUnlocked) return;

        syncActiveTarget(routeTarget, targetRegistry);
    }, [
        routeTarget,
        progressHydrated,
        routeTargetUnlocked,
        syncActiveTarget,
        targetRegistry,
    ]);

    const sketch = useDebouncedSketchState({});

    useEffect(() => {
        if (!routeTarget?.topicId) return;
        if (viewTopicId !== routeTarget.topicId) {
            setViewTopicId(routeTarget.topicId);
        }
        if (activeTopicId !== routeTarget.topicId) {
            setActiveTopicId(routeTarget.topicId);
        }
    }, [
        activeTopicId,
        routeTarget?.topicId,
        setActiveTopicId,
        setViewTopicId,
        viewTopicId,
    ]);


    useEffect(() => {
        if (!progressHydrated) return;
        if (!topics.length) return;

        const {changed, nextTopics} = buildNormalizedTopicsProgress(topics, progress ?? null);
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
        enabled: !isTutoringSession && Boolean(subjectSlug && moduleSlug),
        refreshKey:
            progressHydrated &&
            `${subjectSlug}:${moduleSlug}:${String(moduleCompleteFromProgress(progress, topics))}:${String(
                (progress as any)?.moduleCompleted,
            )}`,
    });


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

    const nav = useModuleNav({
        subjectSlug,
        moduleSlug,
        catalogSlug,
        enabled: !isTutoringSession,
    });

    const canGoNextModule =
        unlockAll ||
        (moduleComplete || Boolean((progress as any)?.moduleCompleted));

    const navLoading = !isTutoringSession && nav === undefined;
    const navError = !isTutoringSession && nav === null;
    const [courseModulesOpen, setCourseModulesOpen] = useState(false);

    useEffect(() => {
        setCourseModulesOpen(false);
    }, [moduleSlug]);

    const buildCourseModuleHref = useCallback(
        (targetModuleSlug: string) => {
            const catalogPrefix = catalogSlug
                ? `/catalog/${encodeURIComponent(catalogSlug)}`
                : "";

            return (
                `/${encodeURIComponent(locale)}` +
                catalogPrefix +
                `/subjects/${encodeURIComponent(subjectSlug)}` +
                `/modules/${encodeURIComponent(targetModuleSlug)}` +
                "/learn"
            );
        },
        [catalogSlug, locale, subjectSlug],
    );

    const handleSelectCourseModule = useCallback(
        async (item: CourseModuleNavItem) => {
            if (item.current || item.slug === moduleSlug) {
                setCourseModulesOpen(false);
                return;
            }

            await flushAll();
            setCourseModulesOpen(false);
            beginRouteTransition();
            router.push(
                item.locked && item.billingHref
                    ? item.billingHref
                    : buildCourseModuleHref(item.slug),
            );
        },
        [beginRouteTransition, buildCourseModuleHref, flushAll, moduleSlug, router],
    );

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

    const navigateToResolvedTarget = useCallback(
        async (
            target: ReviewResolvedRouteTarget | null,
            mode: "push" | "replace" = "push",
            options: NavigateToResolvedTargetOptions = {},
        ) => {
            if (!target) return;

            const bypassProgressiveLock = Boolean(options.bypassProgressiveLock);

            let nextTargetKey = getTargetKeyForRouteTarget(targetRegistry, target);

            if (bypassProgressiveLock && nextTargetKey) {
                trustedProgressiveBypassTargetKeyRef.current = nextTargetKey;
            } else if (!bypassProgressiveLock) {
                trustedProgressiveBypassTargetKeyRef.current = null;
            }

            const nextIsUnlocked =
                bypassProgressiveLock ||
                unlockAll ||
                !progressHydrated ||
                !nextTargetKey ||
                progressiveUnlock.unlockedTargetKeys.has(nextTargetKey);

            if (!nextIsUnlocked) {
                showProgressiveLockMessage();

                if (firstUnlockedRouteTarget && mode === "replace") {
                    target = firstUnlockedRouteTarget;
                    nextTargetKey = getTargetKeyForRouteTarget(targetRegistry, target);
                } else {
                    return;
                }
            }

            const href = buildRoutePathForCurrentSurface(target);

            beginRouteTransition();
            routeTargetRef.current = target;
            setRouteTarget(target);

            try {
                await flushAll();

                if (typeof window !== "undefined") {
                    const nextHistoryState = buildReviewRouteHistoryState(window.history.state, {
                        href,
                        targetKey: nextTargetKey,
                        subjectSlug,
                        moduleSlug,
                    });

                    if (mode === "replace") {
                        window.history.replaceState(nextHistoryState, "", href);
                    } else {
                        window.history.pushState(nextHistoryState, "", href);
                    }
                }
            } finally {
                finishRouteTransition();
            }
        },
        [
            beginRouteTransition,
            buildRoutePathForCurrentSurface,
            finishRouteTransition,
            firstUnlockedRouteTarget,
            flushAll,
            moduleSlug,
            progressHydrated,
            progressiveUnlock.unlockedTargetKeys,
            showProgressiveLockMessage,
            subjectSlug,
            targetRegistry,
            unlockAll,
        ],
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const syncVisibleRouteToAddressBar = () => {
            const visibleTarget = routeTargetRef.current;
            if (!visibleTarget) return;

            const href = buildRoutePathForCurrentSurface(visibleTarget);
            const targetKey = getTargetKeyForRouteTarget(targetRegistry, visibleTarget);
            const nextHistoryState = buildReviewRouteHistoryState(window.history.state, {
                href,
                targetKey,
                subjectSlug,
                moduleSlug,
            });

            window.history.replaceState(nextHistoryState, "", href);
        };

        window.addEventListener("pagehide", syncVisibleRouteToAddressBar);
        window.addEventListener("beforeunload", syncVisibleRouteToAddressBar);

        return () => {
            window.removeEventListener("pagehide", syncVisibleRouteToAddressBar);
            window.removeEventListener("beforeunload", syncVisibleRouteToAddressBar);
        };
    }, [buildRoutePathForCurrentSurface, moduleSlug, subjectSlug, targetRegistry]);

    useEffect(() => {
        if (!progressHydrated) return;
        if (!targetRegistry) return;
        if (!routeTarget) return;
        if (routeTargetUnlocked) return;
        if (!firstUnlockedRouteTarget) return;

        void navigateToResolvedTarget(firstUnlockedRouteTarget, "replace");
        showProgressiveLockMessage();
    }, [
        firstUnlockedRouteTarget,
        navigateToResolvedTarget,
        progressHydrated,
        routeTarget,
        routeTargetUnlocked,
        showProgressiveLockMessage,
        targetRegistry,
    ]);

    const showSkeleton = useSkeletonGate({
        ready: progressHydrated,
        swapKey: `${subjectSlug}:${moduleSlug}:${locale}`,
        reduceMotion: useReduceMotion(),
        initialMinMs: 240,
        swapMs: 170,
    });

    const reduceMotion = useReduceMotion();
    const [showMask, setShowMask] = useState(false);

    const maxUnlockedCardIndex = useMemo(
        () =>
            maxUnlockedCardIndexForTopic({
                registry: targetRegistry,
                topicId: viewTid,
                viewCards,
                unlockedTargetKeys: progressiveUnlock.unlockedTargetKeys,
            }),
        [progressiveUnlock.unlockedTargetKeys, targetRegistry, viewCards, viewTid],
    );

    const handleNavigateCardIndex = useCallback((
        index: number,
        options: NavigateToResolvedTargetOptions = {},
    ) => {
        const clamped = Math.max(0, Math.min(viewCards.length - 1, index));
        const bypassProgressiveLock = Boolean(options.bypassProgressiveLock);

        if (!bypassProgressiveLock && !unlockAll && clamped > maxUnlockedCardIndex) {
            showProgressiveLockMessage();
            return;
        }

        const nextCard = viewCards[clamped] ?? null;
        if (!nextCard) return;

        void navigateToResolvedTarget(
            buildReviewCardRouteTarget({
                mod,
                topicId: viewTid,
                card: nextCard,
            }),
            "push",
            {bypassProgressiveLock},
        );
    }, [
        maxUnlockedCardIndex,
        mod,
        navigateToResolvedTarget,
        showProgressiveLockMessage,
        unlockAll,
        viewCards,
        viewTid,
    ]);

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
    const toolsResetKey = `${viewTid}:${versionStr}:reset:${store.resetRevision}`;

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
        routeOwned: true,
        onNavigateToCardIndex: handleNavigateCardIndex,
    });
    const routeCardIndex = useMemo(() => {
        if (!routeTarget?.cardId) return -1;
        return viewCards.findIndex((card) => card.id === routeTarget.cardId);
    }, [routeTarget?.cardId, viewCards]);

    const activeCardIndex = routeCardIndex >= 0 ? routeCardIndex : 0;
    const activeCard = viewCards[activeCardIndex] ?? null;
    const compactQuizNavigationRef = useRef<CompactQuizNavigationState | null>(null);
    const compactQuizNavigationSignatureRef = useRef<string>("none");
    const [compactQuizNavigationVersion, setCompactQuizNavigationVersion] = useState(0);
    const handleCompactQuizNavigationChange = useCallback((state: CompactQuizNavigationState | null) => {
        const signature = state
            ? [
                state.cardId,
                state.quizId,
                state.activeIndex,
                state.total,
                state.canGoPrev ? 1 : 0,
                state.canGoNext ? 1 : 0,
                state.kind ?? "",
                state.stepStatuses?.join(",") ?? "",
                state.prevLabel ?? "",
                state.nextLabel ?? "",
            ].join(":")
            : "none";

        compactQuizNavigationRef.current = state;

        if (compactQuizNavigationSignatureRef.current === signature) return;

        compactQuizNavigationSignatureRef.current = signature;
        setCompactQuizNavigationVersion((value) => value + 1);
    }, []);
    const compactQuizNavigation =
        compactQuizNavigationVersion >= 0 &&
        compactQuizNavigationRef.current?.cardId === activeCard?.id
            ? compactQuizNavigationRef.current
            : null;
    const [activeMobileWorkspaceTab, setActiveMobileWorkspaceTab] = useState<"lesson" | "code">("lesson");

    const runtimeExercises = useReviewRuntimeStore((s) => s.exercises);

    useEffect(() => {
        useReviewRuntimeStore.getState().goToCard(Math.max(0, activeCardIndex));
    }, [activeCardIndex]);

    const activeExerciseTarget = useMemo(() => {
        if (routeTarget?.kind === "exercise") {
            return {
                topicId: routeTarget.topicId,
                cardId: routeTarget.cardId,
                exerciseStateKey: routeTarget.exerciseStateKey,
                exerciseId: routeTarget.exerciseId,
            };
        }
        return null;
    }, [routeTarget]);

    const activeCardWorkspaceExercise = useMemo(() => {
        if (!activeCard?.id) return null;

        return Object.values(runtimeExercises)
            .filter(
                (exercise) =>
                    exercise.topicId === viewTid &&
                    exercise.cardId === activeCard.id,
            )
            .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
            .find((exercise) =>
                shouldUseWorkspaceCodeSurface({
                    exercise:
                        ((exercise.manifest as Record<string, unknown> | null) ??
                            ({
                                kind: "code_input",
                                language: exercise.language,
                                ideConfig: exercise.ideConfig,
                                workspace: exercise.workspace,
                                sqlDatasetId: exercise.sqlDatasetId,
                                sqlSchemaSql: exercise.sqlSchemaSql,
                                sqlSeedSql: exercise.sqlSeedSql,
                                sqlInitialTableSnapshots: exercise.sqlInitialTableSnapshots,
                            } as any)) as any,
                }),
            ) ?? null;
    }, [runtimeExercises, viewTid, activeCard?.id]);

    const activeCardRegistryExerciseEntry = useMemo(() => {
        if (!targetRegistry || !activeCard?.id || !viewTid) return null;

        return (targetRegistry.orderedKeys ?? [])
            .map((key) => targetRegistry.byKey[key])
            .find(
                (entry) =>
                    entry?.ownerKind === "exercise" &&
                    entry.cardId === activeCard.id &&
                    entry.topicId === viewTid &&
                    Boolean(entry.exerciseStateKey) &&
                    shouldUseWorkspaceCodeSurface({
                        exercise: entry.toolManifest as any,
                    }),
            ) ?? null;
    }, [targetRegistry, activeCard?.id, viewTid]);

    const activeCardExerciseTools =
        toolPresentationPolicyFromManifest(
            activeCardWorkspaceExercise?.manifest,
        );

    const shouldDefaultCollapseRightRail = shouldDefaultCollapseToolsRail({
        showDebugLearningUi: learnerUiFlags.showDebugLearningUi,
        activeCard,
        topicTools: viewTopic?.meta?.tools,
        exerciseTools: activeCardExerciseTools,
        routeTargetKind: routeTarget?.kind ?? null,
        routeTargetTargetKind: routeTarget?.targetKind ?? null,
        cardHasEmbeddedTryIt: Boolean(
            (activeCard?.type === "text" || activeCard?.type === "sketch") &&
            activeCard.tryIt,
        ),
        hasWorkspaceExercise: Boolean(activeCardWorkspaceExercise),
    });
    const toolsRailVisibility = resolveToolsRailVisibility({
        activeCard,
        topicTools: viewTopic?.meta?.tools,
        exerciseTools: activeCardExerciseTools,
        routeTargetKind: routeTarget?.kind ?? null,
        routeTargetTargetKind: routeTarget?.targetKind ?? null,
        cardHasEmbeddedTryIt: Boolean(
            (activeCard?.type === "text" || activeCard?.type === "sketch") &&
            activeCard.tryIt,
        ),
        hasWorkspaceExercise: Boolean(activeCardWorkspaceExercise),
    });
    const routeExerciseStateKey =
        routeTarget?.kind === "exercise" ? routeTarget.exerciseStateKey : "";
    const activeCardTryItKey =
        activeCard?.type === "text" || activeCard?.type === "sketch"
            ? activeCard.tryIt?.exerciseKey ?? activeCard.tryIt?.id ?? ""
            : "";

    const rightRailDefaultScopeKey = useMemo(
        () =>
            [
                routeTarget?.kind ?? "card",
                routeTarget?.sectionSlug ?? sectionSlug ?? "",
                routeTarget?.topicId ?? viewTid ?? "",
                routeTarget?.cardId ?? activeCard?.id ?? "",
                routeExerciseStateKey,
                activeCard?.type ?? "",
                activeCardRegistryExerciseEntry?.exerciseStateKey ?? "",
                activeCardWorkspaceExercise?.exerciseKey ?? "",
                activeCardTryItKey,
                shouldDefaultCollapseRightRail ? "collapsed" : "open",
            ].join("::"),
        [
            activeCard?.id,
            activeCard?.type,
            activeCardTryItKey,
            activeCardWorkspaceExercise?.exerciseKey,
            activeCardRegistryExerciseEntry?.exerciseStateKey,
            routeTarget?.cardId,
            routeTarget?.kind,
            routeTarget?.sectionSlug,
            routeTarget?.topicId,
            routeExerciseStateKey,
            sectionSlug,
            shouldDefaultCollapseRightRail,
            viewTid,
        ],
    );

    const panels = useReviewPanels({
        footerInsetPx,
        shouldDefaultCollapseRightRail,
        rightRailDefaultScopeKey,
        allowDesktopRightRail: toolsRailVisibility.isAvailable,
    });

    const handleOpenCourseModules = useCallback(() => {
        panels.setMobileTopicsOpen(false);
        setCourseModulesOpen(true);
    }, [panels.setMobileTopicsOpen]);

    const activeToolScopeKey = resolveActiveToolScopeKey({
        activeExerciseStateKey: activeExerciseTarget?.exerciseStateKey ?? null,
        activeCardWorkspaceExerciseKey: activeCardWorkspaceExercise?.exerciseKey ?? null,
    });

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
        flushToolLatestRef.current = tool.flushLatest;

        return () => {
            if (flushToolLatestRef.current === tool.flushLatest) {
                flushToolLatestRef.current = null;
            }
        };
    }, [tool.flushLatest]);
    const prereqsForAllQuizzes = unlockAll
        ? true
        : prereqsMetForAnyQuizOrProject(viewCards, viewProg, viewTid);

    const moduleProgress = useMemo(
        () => getModuleProgress(topics, progress),
        [topics, progress],
    );

    const {summary: gamificationSummary} = useGamificationSummary();

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

    const findFirstRouteTargetForTopic = useCallback(
        (topicId: string): ReviewResolvedRouteTarget | null => {
            const topic = (topics ?? []).find((item) => item.id === topicId);
            const firstCard = Array.isArray(topic?.cards) ? topic.cards[0] : null;

            if (!topic || !firstCard) return null;

            return buildReviewCardRouteTarget({
                mod,
                topicId: topic.id,
                card: firstCard,
            });
        },
        [mod, topics],
    );

    const findFirstRouteTargetForModule = useCallback((): ReviewResolvedRouteTarget | null => {
        const firstTopic = (topics ?? []).find(
            (topic) => Array.isArray(topic.cards) && topic.cards.length > 0,
        );

        if (!firstTopic) return null;

        return findFirstRouteTargetForTopic(firstTopic.id);
    }, [findFirstRouteTargetForTopic, topics]);

    const resetFlow = useReviewReset({
        topics,
        firstTopicId,
        progress,
        setProgress,
        setActiveTopicId,
        setViewTopicId,
        flushNow,
        toolUnbindCodeInput: tool.unbindCodeInput,

        onAfterResetModule: () => {
            const firstTarget = findFirstRouteTargetForModule();

            if (!firstTarget) return;

            void navigateToResolvedTarget(firstTarget, "replace");
        },

        onAfterResetTopic: (topicId) => {
            const firstTarget = findFirstRouteTargetForTopic(topicId);

            if (!firstTarget) return;

            void navigateToResolvedTarget(firstTarget, "replace");
        },
    });
    const handleAssignmentClick = useCallback(async () => {
        const returnToCurrentModule = `/${locale}${ROUTES.learningPath(
            encodeURIComponent(subjectSlug),
            encodeURIComponent(moduleSlug),
        )}`;

        // Always resolve the module-assignment session through the dedicated
        // start/resume endpoint. Older builds stored a subscriber-practice
        // session id in assignmentSessionId; routing directly to that id caused
        // the assignment CTA to open the configurable subscriber workspace.
        const practiceModuleSlug = (mod as any).practiceSectionSlug ?? moduleSlug;
        const r = await fetch(`/api/modules/${encodeURIComponent(practiceModuleSlug)}/practice/start`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                returnUrl: returnToCurrentModule,
                resumeSessionId: assignmentSessionId || null,
            }),
        });

        const rawResponse = await r.text();
        let data: any = null;
        try {
            data = rawResponse ? JSON.parse(rawResponse) : null;
        } catch {
            data = null;
        }

        if (!r.ok) {
            const fallback = rawResponse.trim().startsWith("<")
                ? `Unable to start the assignment (${r.status}).`
                : rawResponse.trim() || `Unable to start the assignment (${r.status}).`;
            alert(data?.message ?? fallback);
            return;
        }

        if (!data?.sessionId) {
            alert("The assignment started without returning a session. Please try again.");
            return;
        }

        const newSid = String(data.sessionId);

        const next: ReviewProgressState = {
            ...(progress as any),
            assignmentSessionId: newSid as any,
        };
        setProgress(next);
        await flushNow(next, {
            discardPendingSaves: true,
            mergeRuntime: true,
            reason: "module-assignment-session",
        });
        beginRouteTransition();
        router.push(
            buildModulePracticeHref({
                subjectSlug,
                moduleSlug: practiceModuleSlug,
                sessionId: newSid,
                mode: "assignment",
                returnTo: returnToCurrentModule,
            }),
        );
    }, [
        locale,
        subjectSlug,
        moduleSlug,
        router,
        mod,
        progress,
        assignmentSessionId,
        setProgress,
        flushNow,
        beginRouteTransition,
    ]);

    // const handleBack = useCallback(() => {
    //     /**
    //      * In the review module, Back should leave the lesson/review page and return
    //      * to the module chooser. Do not use router.back(), because browser history
    //      * may point to another in-module route and keep the review controller mounted.
    //      */
    //     beginRouteTransition();
    //
    //     router.push(
    //         ROUTES.subjectModules(
    //             encodeURIComponent(subjectSlug),
    //         ),
    //     );
    // }, [beginRouteTransition, router, subjectSlug]);

    const nextLocked = Boolean(nav?.nextLocked);
    const nextBillingHref = useMemo(() => {
        if (!nextLocked || !nav?.nextModuleId) {
            return nav?.nextBillingHref ?? null;
        }

        const currentBackPath =
            (typeof window !== "undefined" ? window.location.pathname : pathname) || pathname || "/";

        return buildBillingHref({
            locale,
            next: `/${ROUTES.learningPath(subjectSlug, nav.nextModuleId)}`,
            back: currentBackPath,
            reason: "module",
            subject: subjectSlug,
            module: nav.nextModuleId,
        });
    }, [locale, nav?.nextBillingHref, nav?.nextModuleId, nextLocked, pathname, subjectSlug]);

    const goModule = useCallback(
        (mid: string) => {
            beginRouteTransition();

            router.push(
                ROUTES.learningPath(
                    encodeURIComponent(subjectSlug),
                    encodeURIComponent(mid),
                ),
            );
            router.refresh();
        },
        [beginRouteTransition, router, subjectSlug],
    );

    const goUnlockNext = useCallback(() => {
        beginRouteTransition();

        router.push(nextBillingHref || "/billing");
        router.refresh();
    }, [beginRouteTransition, router, nextBillingHref]);

    const handleOutroContinue = useCallback(() => {
        if (topicFlow.nextTopic?.id) {
            const nextTopic = topics.find((topic) => topic.id === topicFlow.nextTopic?.id) ?? null;
            const nextCard = nextTopic?.cards?.[0] ?? null;
            if (nextTopic && nextCard) {
                void navigateToResolvedTarget(
                    buildReviewCardRouteTarget({
                        mod,
                        topicId: nextTopic.id,
                        card: nextCard,
                    }),
                );
            }
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
        buildReviewCardRouteTarget,
        mod,
        navigateToResolvedTarget,
        topicFlow.nextTopic?.id,
        topics,
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
    const activeCardResetTarget = useMemo<{
        resetTarget: QuizResetTarget;
        menuLabel: string;
        menuDescription: string;
        dialogTitle: string;
        dialogDescription: string;
    } | null>(() => {
        if (!activeCard) return null;

        const embeddedTryIt = getEmbeddedTryIt(activeCard);
        if (embeddedTryIt && embeddedTryIt.required !== false) {
            return {
                resetTarget: {
                    progressId: embeddedTryIt.id,
                    runtimeCardId: activeCard.id,
                    cardProgressKeys: [activeCard.id, embeddedTryIt.id],
                    exerciseId: embeddedTryIt.exerciseKey,
                } satisfies QuizResetTarget,
                menuLabel: "This exercise",
                menuDescription: "Clear the current Try it yourself answer and editor state.",
                dialogTitle: "Reset this exercise?",
                dialogDescription:
                    "This will clear the current Try it yourself exercise and cannot be undone.",
            };
        }

        if (!isQuizLikeCard(activeCard)) return null;

        return {
            resetTarget: {
                progressId: activeCard.id,
                runtimeCardId: activeCard.id,
                cardProgressKeys: [activeCard.id],
            } satisfies QuizResetTarget,
            menuLabel: activeCard.type === "project" ? "This project" : "This quiz",
            menuDescription:
                activeCard.type === "project"
                    ? "Clear the current project practice progress and editor state."
                    : "Clear the current quiz progress and answers.",
            dialogTitle:
                activeCard.type === "project" ? "Reset this project?" : "Reset this quiz?",
            dialogDescription:
                activeCard.type === "project"
                    ? "This will clear the current project practice progress and cannot be undone."
                    : "This will clear the current quiz progress and cannot be undone.",
        };
    }, [activeCard]);
    const [confirmResetCurrentCard, setConfirmResetCurrentCard] = useState(false);
    const requestResetCurrentCard = useCallback(() => {
        if (!activeCardResetTarget) return;
        setConfirmResetCurrentCard(true);
    }, [activeCardResetTarget]);
    const cancelResetCurrentCard = useCallback(() => {
        setConfirmResetCurrentCard(false);
    }, []);
    const applyResetCurrentCard = useCallback(() => {
        if (!activeCardResetTarget) return;

        const resetTarget = activeCardResetTarget.resetTarget;
        const runtimeStore = useReviewRuntimeStore.getState();
        const runtimeCardId =
            resetTarget.runtimeCardId ?? resetTarget.progressId;

        const resetResult = resetTarget.exerciseId
            ? runtimeStore.resetExerciseToStarter({
                topicId: viewTid,
                cardId: runtimeCardId,
                exerciseId: resetTarget.exerciseId,
                exerciseStateKey: resetTarget.exerciseStateKey,
            })
            : null;

        if (!resetTarget.exerciseId) {
            runtimeStore.clearRuntimeForCard(viewTid, runtimeCardId);
        }

        if (resetResult?.exerciseKey) {
            clearReviewWorkspaceDrafts(
                (ownerKey) => ownerKey === resetResult.exerciseKey,
            );
        } else {
            clearReviewWorkspaceDrafts((ownerKey) => {
                const parts = ownerKey.split(":").filter(Boolean);
                const ownerTopicId = parts[3] ?? "";
                const ownerCardId = parts[4] ?? "";
                return ownerTopicId === viewTid && ownerCardId === runtimeCardId;
            });
        }

        const next = buildQuizResetProgress(progress, viewTid, resetTarget);
        setProgress(next);
        void Promise.resolve(
            flushNow(next, {
                reason: "reset-card",
                mergeRuntime: false,
                discardPendingSaves: true,
            }),
        ).catch((error) => {
            console.error("[review-reset] failed to persist exercise reset", error);
        });

        setConfirmResetCurrentCard(false);
    }, [
        activeCardResetTarget,
        flushNow,
        progress,
        setProgress,
        viewTid,
    ]);
    const headerResetOptions = useMemo(() => {
        const options: Array<{
            id: string;
            label: string;
            description: string;
            onSelect: () => void;
        }> = [];

        if (activeCardResetTarget) {
            options.push({
                id: "card",
                label: activeCardResetTarget.menuLabel,
                description: activeCardResetTarget.menuDescription,
                onSelect: requestResetCurrentCard,
            });
        }

        options.push(
            {
                id: "topic",
                label: "This topic",
                description: "Clear the current topic and start it over.",
                onSelect: handleResetCurrentTopic,
            },
            {
                id: "module",
                label: "This module",
                description: "Clear every topic and quiz in this module.",
                onSelect: resetFlow.requestResetModule,
            },
        );

        return options;
    }, [activeCardResetTarget, handleResetCurrentTopic, requestResetCurrentCard, resetFlow.requestResetModule]);

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
            }).map((item) => {
                if (unlockAll) return item;

                const hasUnlockedTarget = Boolean(
                    firstRouteTargetForUnlockedTopic({
                        registry: targetRegistry,
                        topicId: item.id,
                        unlockedTargetKeys: progressiveUnlock.unlockedTargetKeys,
                    }),
                );

                return {
                    ...item,
                    disabled: item.disabled || !hasUnlockedTarget,
                };
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
            progressiveUnlock.unlockedTargetKeys,
            targetRegistry,
        ],
    );

    const stackedToolsRef = useRef<HTMLElement | null>(null);

    const handleEnsureToolsVisible = useCallback(() => {
        if (!toolsRailVisibility.isAvailable || !toolsRailVisibility.allowOpen) {
            return;
        }

        if (panels.rightCollapsed) {
            panels.setRightCollapsed(false);
        }

        if (panels.showDesktopRight) return;

        setActiveMobileWorkspaceTab("code");

        const scrollToTools = () => {
            stackedToolsRef.current?.scrollIntoView({
                block: "start",
                behavior: "smooth",
            });
        };

        if (typeof window !== "undefined") {
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(scrollToTools);
            });
            return;
        }

        scrollToTools();
    }, [
        panels.rightCollapsed,
        panels.setRightCollapsed,
        panels.showDesktopRight,
        toolsRailVisibility.allowOpen,
        toolsRailVisibility.isAvailable,
    ]);

    const handleRun = useCallback(() => {
        void flushAll();
    }, [flushAll]);

    const handleReveal = useCallback(() => {
        void flushAll();
    }, [flushAll]);

    const handleSubmit = useCallback(() => {
        void flushAll();
    }, [flushAll]);

    const handleNavigateToExerciseRoute = useCallback(
        async ({cardId, exerciseId}: { cardId: string; exerciseId: string }) => {
            const normalizedCardId = cardId.trim();
            const normalizedExerciseId = exerciseId.trim();
            if (!normalizedCardId || !normalizedExerciseId) return;

            const nextTarget = buildReviewExerciseRouteTarget({
                mod,
                topicId: viewTid,
                cardId: normalizedCardId,
                exerciseId: normalizedExerciseId,
                subjectSlug,
                moduleSlug,
                sectionSlug: routeTarget?.sectionSlug ?? sectionSlug,
            });

            await flushAll();

            await navigateToResolvedTarget(nextTarget, "push", {
                bypassProgressiveLock: true,
            });
        },
        [
            flushAll,
            mod,
            moduleSlug,
            navigateToResolvedTarget,
            routeTarget?.sectionSlug,
            sectionSlug,
            subjectSlug,
            viewTid,
        ],
    );

    const handleBindToToolsPanel = useCallback(
        async (args: Parameters<typeof tool.bindCodeInput>[0]) => {
            const ownerCardId = args.ownerCardId?.trim() || activeCard?.id || "general";
            const targetExerciseKey = String((args as any).exerciseKey ?? args.id ?? "");
            const activeRouteTarget = routeTargetRef.current;
            const inputId = typeof args.id === "string" ? args.id.trim() : "";

            const activeRouteOwnsThisExercise =
                activeRouteTarget?.kind === "exercise" &&
                activeRouteTarget.cardId === ownerCardId &&
                (
                    activeRouteTarget.exerciseStateKey === targetExerciseKey ||
                    activeRouteTarget.exerciseStateKey === inputId ||
                    activeRouteTarget.exerciseId === inputId
                );

            const routeExerciseId = activeRouteOwnsThisExercise
                ? activeRouteTarget.exerciseId
                : pickRouteExerciseId({
                    activeRouteTarget,
                    ownerCardId,
                    inputId,
                    targetExerciseKey,
                });

            const nextTarget = buildReviewExerciseRouteTarget({
                mod,
                topicId: viewTid,
                cardId: ownerCardId,
                exerciseId: routeExerciseId,
                subjectSlug,
                moduleSlug,
                sectionSlug: routeTarget?.sectionSlug ?? sectionSlug,
            });

            /**
             * Route is the source of truth.
             *
             * During top-level card navigation, the previous exercise editor can
             * briefly re-register before unmounting. If we honor that stale bind,
             * it will repush the old exercise route and snap the UI back to the
             * previous project question.
             *
             * Only let tool binds influence routing when they belong to the card
             * and exercise that currently own the route target.
             */
            if (
                activeRouteTarget?.cardId &&
                ownerCardId &&
                activeRouteTarget.cardId !== ownerCardId &&
                activeCard?.id !== ownerCardId
            ) {
                return false;
            }

            const currentExerciseStateKey =
                activeRouteTarget?.kind === "exercise"
                    ? activeRouteTarget.exerciseStateKey
                    : null;
            const routeAlreadyActive =
                currentExerciseStateKey === nextTarget.exerciseStateKey ||
                currentExerciseStateKey === targetExerciseKey ||
                currentExerciseStateKey === inputId;

            if (
                activeRouteTarget?.kind === "exercise" &&
                activeRouteTarget.cardId === ownerCardId &&
                !routeAlreadyActive
            ) {
                return false;
            }

            await tool.bindCodeInput(args as any);

            if (!routeAlreadyActive) {
                void navigateToResolvedTarget(nextTarget, "push", {
                    bypassProgressiveLock: true,
                });
            }

            return true;
        },
        [
            tool.bindCodeInput,
            tool.flushLatest,
            tool.boundId,
            activeCard?.id,
            navigateToResolvedTarget,
            mod,
            moduleSlug,
            sectionSlug,
            subjectSlug,
            viewTid,
        ],
    );

    const handleUnbindFromToolsPanel = useCallback(() => {
        void tool.flushLatest();
        tool.unbindCodeInput();
        /**
         * Route is the durable source of truth.
         *
         * A transient unbind during mount/unmount or tools reconciliation must
         * not downgrade an exercise route back to the outer project card route,
         * otherwise starter-backed exercise workspaces never get a chance to
         * hydrate under their canonical exercise owner key.
         */
    }, [tool.flushLatest, tool.unbindCodeInput]);

    const toolsProvider = useMemo(
        () => ({
            enabled: panels.toolsUiEnabled && toolsRailVisibility.isAvailable,
            /**
             * Keep the registry stable across progress/version churn.
             *
             * Mounted practice/project exercise renderers do not automatically
             * re-register just because quizVersion changed, so including
             * versionStr here can clear the code-input registry while the
             * global tool binding still points at the same exercise.
             */
            resetKey: toolsResetKey,
            externalBoundId:
                activeExerciseTarget?.exerciseStateKey ?? activeExerciseTarget?.exerciseId ?? null,
            ensureVisible: handleEnsureToolsVisible,
            onBindToToolsPanel: handleBindToToolsPanel,
            onUnbindFromToolsPanel: handleUnbindFromToolsPanel,
        }),
        [
            panels.toolsUiEnabled,
            toolsRailVisibility.isAvailable,
            toolsResetKey,
            activeExerciseTarget?.exerciseStateKey,
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
    const showAssignmentCta = !isTutoringSession && resolveCompactAssignmentCtaVisibility({
        compactLearnerUi: learnerUiFlags.compactLearnerUi,
        showDebugLearningUi: learnerUiFlags.showDebugLearningUi,
        topics,
        progress,
        assignmentPhase: assignmentStatus.phase,
        activeCard,
        moduleComplete,
    });
    const hasActiveTopic = Boolean(viewTid);
    const isAtModuleEnd = !topicFlow.nextTopic?.id;
    const shouldHideModuleNavInCompactMode =
        compactModeActive &&
        hasActiveTopic &&
        !viewIsComplete &&
        !moduleComplete &&
        !isAtModuleEnd;

    const activeCardDone = activeCard ? isCardDoneFromState(activeCard, viewProg) : false;
    const activeCardCanAdvance =
        unlockAll ||
        activeCardDone ||
        (activeCard
            ? !isQuizLikeCard(activeCard) && !hasRequiredEmbeddedTryIt(activeCard)
            : false);
    const hasPrevCard = activeCardIndex > 0;
    const hasNextCard = activeCardIndex < Math.max(0, viewCards.length - 1);
    const nextCard = hasNextCard ? viewCards[activeCardIndex + 1] ?? null : null;
    const compactNavigationMatchesActiveCard =
        compactQuizNavigation?.cardId === activeCard?.id;
    const nestedNavigationIsStillLoading = Boolean(
        activeCard &&
        isQuizLikeCard(activeCard) &&
        !viewIsComplete &&
        !compactNavigationMatchesActiveCard,
    );
    const hasNextNestedStep = Boolean(
        nestedNavigationIsStillLoading ||
        (compactNavigationMatchesActiveCard && compactQuizNavigation?.canGoNext),
    );
    const atFinalModuleNavigationStep = isAtFinalModuleNavigationStep({
        hasNextNestedStep,
        hasNextCard,
        hasNextTopic: Boolean(topicFlow.nextTopic?.id),
    });
    const compactSingleNextLocked = Boolean(
        nextLocked &&
        nav?.nextModuleId &&
        atFinalModuleNavigationStep,
    );
    const nextCardUnlocked =
        unlockAll || activeCardIndex + 1 <= maxUnlockedCardIndex;
    const canGoNextCard =
        hasNextCard && activeCardCanAdvance && nextCardUnlocked;
    const certificateLabel = subjectFinish?.certificateIssued
        ? "View certificate"
        : "Get certificate";
    const canOpenCertificate = Boolean(
        subjectFinish?.certificateEligible || subjectFinish?.certificateIssued,
    );
    const showFinalCertificateCta = shouldShowFinalCertificateCta({
        navLoading,
        navError,
        nextModuleId: nav?.nextModuleId ?? null,
        nextTopicId: topicFlow.nextTopic?.id ?? null,
        activeCardIndex,
        cardCount: viewCards.length,
        topicComplete: viewIsComplete,
        atEndOfPublishedTrack: Boolean(subjectFinish?.atEndOfPublishedTrack),
    });
    const compactSinglePrevEnabled =
        Boolean(compactQuizNavigation?.canGoPrev) ||
        hasPrevCard ||
        Boolean(topicFlow.prevTopic?.id) ||
        Boolean(nav?.prevModuleId);
    const compactSingleNextEnabled =
        Boolean(compactQuizNavigation?.canGoNext) ||
        canGoNextCard ||
        (viewIsComplete && outroContinueEnabled) ||
        (showFinalCertificateCta && canOpenCertificate);
    const compactSinglePrevLabel =
        compactQuizNavigation?.canGoPrev && compactQuizNavigation.prevLabel
            ? compactQuizNavigation.prevLabel
            : "Previous";
    const compactSingleNextLabel = useMemo(() => {
        if (compactQuizNavigation?.canGoNext && compactQuizNavigation.nextLabel) {
            return compactQuizNavigation.nextLabel;
        }

        if (canGoNextCard) {
            return compactCardDestinationLabel(nextCard);
        }

        if (atFinalModuleNavigationStep && nav?.nextModuleId) {
            return compactSingleNextLocked ? "Unlock next" : "Next module";
        }

        if (viewIsComplete && outroContinueEnabled) {
            if (topicFlow.nextTopic?.id) return "Next topic";
            return "Continue";
        }

        if (showFinalCertificateCta) {
            return certificateLabel;
        }

        return "Next";
    }, [
        canGoNextCard,
        compactQuizNavigation?.canGoNext,
        compactQuizNavigation?.nextLabel,
        certificateLabel,
        nextCard,
        atFinalModuleNavigationStep,
        compactSingleNextLocked,
        nav?.nextModuleId,
        outroContinueEnabled,
        showFinalCertificateCta,
        topicFlow.nextTopic?.id,
        viewIsComplete,
    ]);

    const persistBeforeUnifiedNavigation = useCallback(async () => {
        await flushAll();

        setProgress((prev) => {
            const runtimeState = useReviewRuntimeStore.getState();
            let next = mergeRuntimeIntoProgress(prev, runtimeState);

            if (
                activeCard &&
                !isQuizLikeCard(activeCard) &&
                canAutoMarkReadingCardDone(activeCard, (next as any)?.topics?.[viewTid])
            ) {
                next = buildMarkCardDoneProgress(next, viewTid, activeCard);
            }

            queueMicrotask(() => flushNow(next));
            return next;
        });
    }, [activeCard, flushAll, flushNow, setProgress, viewTid]);

    const navigateToTopicEdgeCard = useCallback((topicId: string | null | undefined, edge: "first" | "last") => {
        if (!topicId) return false;

        const topic = topics.find((item) => item.id === topicId) ?? null;
        const cards = Array.isArray(topic?.cards) ? topic.cards : [];
        const card = edge === "last" ? cards[cards.length - 1] : cards[0];

        if (!topic || !card) return false;

        void navigateToResolvedTarget(
            buildReviewCardRouteTarget({
                mod,
                topicId: topic.id,
                card,
            }),
        );
        return true;
    }, [mod, navigateToResolvedTarget, topics]);

    const handleCompactSinglePrev = useCallback(async () => {
        if (!compactSinglePrevEnabled) return;

        await persistBeforeUnifiedNavigation();

        const latestQuizNavigation = compactQuizNavigationRef.current;
        if (latestQuizNavigation?.cardId === activeCard?.id && latestQuizNavigation.canGoPrev) {
            latestQuizNavigation.onPrev();
            return;
        }

        if (hasPrevCard) {
            handleNavigateCardIndex(activeCardIndex - 1);
            return;
        }

        if (navigateToTopicEdgeCard(topicFlow.prevTopic?.id, "last")) return;

        if (nav?.prevModuleId) {
            goModule(nav.prevModuleId);
        }
    }, [
        activeCard?.id,
        activeCardIndex,
        compactSinglePrevEnabled,
        goModule,
        handleNavigateCardIndex,
        hasPrevCard,
        nav?.prevModuleId,
        navigateToTopicEdgeCard,
        persistBeforeUnifiedNavigation,
        topicFlow.prevTopic?.id,
    ]);

    const handleCompactSingleNext = useCallback(async () => {
        if (!compactSingleNextEnabled) return;

        await persistBeforeUnifiedNavigation();

        const latestQuizNavigation = compactQuizNavigationRef.current;
        if (latestQuizNavigation?.cardId === activeCard?.id && latestQuizNavigation.canGoNext) {
            latestQuizNavigation.onNext();
            return;
        }

        if (canGoNextCard) {
            handleNavigateCardIndex(activeCardIndex + 1);
            return;
        }

        if (viewIsComplete && outroContinueEnabled) {
            handleOutroContinue();
            return;
        }

        if (showFinalCertificateCta && canOpenCertificate) {
            handleOpenCertificate();
        }
    }, [
        activeCard?.id,
        activeCardIndex,
        canGoNextCard,
        compactSingleNextEnabled,
        handleNavigateCardIndex,
        handleOpenCertificate,
        handleOutroContinue,
        canOpenCertificate,
        outroContinueEnabled,
        persistBeforeUnifiedNavigation,
        showFinalCertificateCta,
        viewIsComplete,
    ]);


    const routeOwnsExercise = routeTarget?.kind === "exercise";
    const routeCanUseBoundExercise = shouldRightRailUseBoundExercise({
        routeOwnsExercise,
        activeCard,
    });
    const routeWorkspaceExercise =
        routeEditorEntry?.ownerKind === "exercise" &&
        shouldUseWorkspaceCodeSurface({
            exercise: routeEditorEntry.toolManifest as any,
        })
            ? routeEditorEntry
            : null;
    const boardEnabled = true;
    const boardScopeKey = `card:${viewTid}:${activeCard?.id ?? routeTarget?.targetSlug ?? "general"}`;
    const tutoringBoardRequestKey = useMemo(
        () =>
            tutoringSessionId
                ? {
                    moduleKey: moduleSlug,
                    cardKey: boardScopeKey,
                    toolId: "board",
                }
                : undefined,
        [boardScopeKey, moduleSlug, tutoringSessionId],
    );
    const shouldRenderStackedTools = Boolean(
        toolsRailVisibility.isAvailable &&
        (boardEnabled || routeWorkspaceExercise || activeCardWorkspaceExercise || activeCardRegistryExerciseEntry),
    );

    useEffect(() => {
        setActiveMobileWorkspaceTab("lesson");
    }, [viewTid, activeCard?.id, activeExerciseTarget?.exerciseId]);

    useEffect(() => {
        if (panels.showDesktopRight || !shouldRenderStackedTools) {
            setActiveMobileWorkspaceTab("lesson");
        }
    }, [panels.showDesktopRight, shouldRenderStackedTools]);

    const stackedToolsExerciseKey =
        activeExerciseTarget?.exerciseStateKey ??
        activeCardRegistryExerciseEntry?.exerciseStateKey ??
        activeCardWorkspaceExercise?.exerciseKey ??
        routeWorkspaceExercise?.exerciseStateKey ??
        null;
    const runtimeBoundExerciseKey = useReviewRuntimeStore((s) => s.tool.boundExerciseKey);
    const boundExerciseRuntime = useReviewRuntimeStore((s) =>
        tool.boundId ? s.exercises[tool.boundId] ?? null : null,
    );
    const boundExerciseMatchesActiveCard = Boolean(
        tool.boundId &&
        activeCard?.id &&
        boundExerciseRuntime?.cardId === activeCard.id,
    );
    const expectedExerciseBindingKey =
        activeExerciseTarget?.exerciseStateKey ??
        activeCardRegistryExerciseEntry?.exerciseStateKey ??
        routeWorkspaceExercise?.exerciseStateKey ??
        activeCardWorkspaceExercise?.exerciseKey ??
        null;
    const hasExpectedExerciseSurface = Boolean(
        expectedExerciseBindingKey ||
        routeOwnsExercise ||
        cardHasAuthoredExerciseSurface(activeCard)
    );
    const runtimeBindingMatchesExpectedExercise = Boolean(
        expectedExerciseBindingKey &&
        runtimeBoundExerciseKey &&
        runtimeBoundExerciseKey === expectedExerciseBindingKey,
    );
    const pendingExerciseBinding = Boolean(
        hasExpectedExerciseSurface &&
        !runtimeBindingMatchesExpectedExercise &&
        !boundExerciseMatchesActiveCard,
    );

    const rightRailExerciseKey = routeCanUseBoundExercise
        ? activeExerciseTarget?.exerciseStateKey ??
          activeCardRegistryExerciseEntry?.exerciseStateKey ??
          (boundExerciseMatchesActiveCard ? tool.boundId : null)
        : null;
    const rightRailExerciseRuntime = useReviewRuntimeStore((s) =>
        rightRailExerciseKey ? s.exercises[rightRailExerciseKey] ?? null : null,
    );
    const rightRailSqlProps = resolveRightRailSqlProps({
        routeCanUseBoundExercise,
        tool,
        topicSqlFallback: runtime.topicSqlFallback,
        topicTools:
            (viewTopic?.meta?.tools as import("@zoeskoul/curriculum-contracts").ToolPresentationPolicy | null | undefined) ??
            null,
        cardTools: activeCard?.tools ?? null,
        compactLayout: !panels.showDesktopRight,
    });
    const rightRailIdeConfig = resolveRightRailIdeConfig({
        rightRailExerciseIdeConfig: rightRailExerciseRuntime?.ideConfig ?? null,
        boundExerciseIdeConfig: boundExerciseRuntime?.ideConfig ?? null,
        toolIdeConfig: tool.toolIdeConfig ?? null,
        runtimeEffectiveIdeConfig: runtime.effectiveIdeConfig ?? null,
    });
    return {
        toolsProvider,

        layout: {
            ariaBusy: showSkeleton || isRouteTransitioning || isModuleContinuePending,
            reduceMotion,
            showMask,
            showSkeleton,
            isNavigating: isRouteTransitioning || isModuleContinuePending,
            navigationLabel: saveStatus === "saving" ? "Saving progress..." : "Loading...",
            leftCollapsed: panels.leftCollapsedEff,
            rightCollapsed: panels.rightCollapsedEff,
            leftW: panels.leftW,
            rightW: panels.rightW,
        },

        header: {
            locale,
            toolsUiEnabled: panels.toolsUiEnabled && toolsRailVisibility.isAvailable,
            toolsToggleAllowed: toolsRailVisibility.allowOpen,
            showDesktopLeft: panels.showDesktopLeft,
            showDesktopRight: panels.showDesktopRight,
            leftCollapsed: panels.leftCollapsed,
            rightCollapsed: panels.rightCollapsed,
            modulesHref: isTutoringSession
                ? routePrefix || `/${encodeURIComponent(locale)}/tutoring-sessions`
                : `/${encodeURIComponent(locale)}` +
                  (catalogSlug
                      ? `/catalog/${encodeURIComponent(catalogSlug)}`
                      : "") +
                  `/subjects/${encodeURIComponent(subjectSlug)}/modules`,
            onOpenModulesDrawer: handleOpenCourseModules,
            onToggleLeftPanel: panels.handleToggleLeftPanel,
            onToggleRightPanel: panels.handleToggleRightPanel,
            resetOptions: headerResetOptions,
            onPrevTopic: topicFlow.prevTopic?.id
                ? () => {
                    const topic = topics.find((item) => item.id === topicFlow.prevTopic?.id) ?? null;
                    const card = topic?.cards?.[0] ?? null;
                    if (topic && card) {
                        void navigateToResolvedTarget(
                            buildReviewCardRouteTarget({
                                mod,
                                topicId: topic.id,
                                card,
                            }),
                        );
                    }
                }
                : undefined,
            onNextTopic: topicFlow.nextTopic?.id
                ? () => {
                    const topic = topics.find((item) => item.id === topicFlow.nextTopic?.id) ?? null;
                    const card = topic?.cards?.[0] ?? null;
                    if (topic && card) {
                        void navigateToResolvedTarget(
                            buildReviewCardRouteTarget({
                                mod,
                                topicId: topic.id,
                                card,
                            }),
                        );
                    }
                }
                : undefined,
            prevTopic: topicFlow.prevTopic,
            nextTopic: topicFlow.nextTopic,
            unlockAll,
            viewIsComplete,
            headerGamification,
            saveStatus,
            lastSaveError,
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
                onGoToTopic: (tid: string) => {
                    const unlockedEntry = firstRouteTargetForUnlockedTopic({
                        registry: targetRegistry,
                        topicId: tid,
                        unlockedTargetKeys: progressiveUnlock.unlockedTargetKeys,
                    });

                    const unlockedTarget = registryEntryToRouteTarget(unlockedEntry);

                    if (!unlockedTarget && !unlockAll) {
                        showProgressiveLockMessage();
                        return;
                    }

                    if (unlockedTarget) {
                        void navigateToResolvedTarget(unlockedTarget);
                        return;
                    }

                    const topic = topics.find((item) => item.id === tid) ?? null;
                    const card = topic?.cards?.[0] ?? null;

                    if (topic && card) {
                        void navigateToResolvedTarget(
                            buildReviewCardRouteTarget({
                                mod,
                                topicId: topic.id,
                                card,
                            }),
                        );
                    }
                },
                onCollapse: panels.handleCollapseLeft,
                assignmentPct: assignmentRightPct,
                assignmentMissedPct: assignmentMissedPct,
                assignmentLabel,
                assignmentSublabel,
                showAssignmentCta,
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
            containerRef: stackedToolsRef,
            shouldRenderStackedTools,
            onResizeStart: panels.onMouseDownRightHandle,
            toolsPanelProps: {
                onCollapse: panels.handleCollapseRight,
                onUnbind: handleUnbindFromToolsPanel,
                boundId: rightRailExerciseKey,
                pendingExerciseBinding,

                /**
                 * Prefer the dynamically bound exercise owner when present.
                 *
                 * routeEditorOwnerKey/routeEditorToolScopeKey describe the static route target.
                 * On review-practice quiz routes, that static target is the quiz/card, not the
                 * generated SQL practice exercise currently bound in Tools.
                 */
                editorOwnerKey: routeCanUseBoundExercise
                    ? rightRailExerciseKey ?? stackedToolsExerciseKey ?? routeEditorOwnerKey
                    : stackedToolsExerciseKey,
                toolScopeKey: routeCanUseBoundExercise
                    ? rightRailExerciseKey
                        ? rightRailExerciseKey
                        : stackedToolsExerciseKey
                            ? stackedToolsExerciseKey
                            : routeEditorToolScopeKey
                            ? routeEditorToolScopeKey
                            : activeToolScopeKey
                    : stackedToolsExerciseKey ?? activeToolScopeKey,
                rightBodyRef: tool.rightBodyRef,
                codeRunnerRegionH: tool.codeRunnerRegionH,
                toolHydrated: tool.toolHydrated,
                toolLang: tool.toolLang,
                toolCode: tool.toolCode,
                toolStdin: tool.toolStdin,
                toolWorkspace: tool.toolWorkspace,

                ideConfig: rightRailIdeConfig,
                // Review workspaces are persisted only through the runtime store
                // and ReviewProgress DB. Disable both CodeToolPane local drafts
                // and FullIDE local draft storage with the same policy prop.
                draftStorageMode: "off" as const,
                onChangeCode: tool.setToolCode,
                onChangeStdin: tool.setToolStdin,
                onChangeWorkspace: tool.setToolWorkspace,
                onBeforeRun: tool.flushLatest,
                subjectSlug,
                moduleId: moduleSlug,
                locale,
                codeEnabled: runtime.codeEnabled,
                boardEnabled,
                boardReadOnly: isTutoringSession && tutoringSession?.canEdit !== true,
                boardScopeKey,
                boardDocumentEndpoint: tutoringDocumentEndpoint,
                boardDocumentRequestKey: tutoringBoardRequestKey,
                boardDocumentRefreshMs: isTutoringSession ? 2000 : undefined,
                notesEnabled: false,
                // Course lessons use a compact Code/Board switcher rather than the
                // larger review-practice Tools/Run/More header.
                showHeader: false,
                showToolTabs: true,
                showLanguagePicker: false,
                showSqlDialectPicker: false,
                toolSqlDialect: rightRailSqlProps.toolSqlDialect,
                sqlResultShape: rightRailSqlProps.sqlResultShape,
                sqlDatasetId: rightRailSqlProps.sqlDatasetId,
                sqlSchemaSql: rightRailSqlProps.sqlSchemaSql,
                sqlSeedSql: rightRailSqlProps.sqlSeedSql,
                sqlInitialTableSnapshots: rightRailSqlProps.sqlInitialTableSnapshots,
                sqlPaneOptions: rightRailSqlProps.sqlPaneOptions,
                runnerPaneOptions: rightRailSqlProps.runnerPaneOptions,
                defaultSurface: rightRailSqlProps.defaultSurface,
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
                    const unlockedEntry = firstRouteTargetForUnlockedTopic({
                        registry: targetRegistry,
                        topicId: tid,
                        unlockedTargetKeys: progressiveUnlock.unlockedTargetKeys,
                    });

                    const unlockedTarget = registryEntryToRouteTarget(unlockedEntry);

                    if (!unlockedTarget && !unlockAll) {
                        showProgressiveLockMessage();
                        return;
                    }

                    if (unlockedTarget) {
                        void navigateToResolvedTarget(unlockedTarget);
                        return;
                    }

                    const topic = topics.find((item) => item.id === tid) ?? null;
                    const card = topic?.cards?.[0] ?? null;

                    if (topic && card) {
                        void navigateToResolvedTarget(
                            buildReviewCardRouteTarget({
                                mod,
                                topicId: topic.id,
                                card,
                            }),
                        );
                    }
                },
                onCollapse: () => panels.setMobileTopicsOpen(false),
                assignmentPct: assignmentRightPct,
                assignmentMissedPct: assignmentMissedPct,
                assignmentLabel,
                assignmentSublabel,
                showAssignmentCta,
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
            activeCardIndex,
            unlockAll,
            navModes: resolvedNavModes,
            maxUnlockedCardIndex,
            progressiveLockMessage,
            onLockedNavigate: showProgressiveLockMessage,
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
            routeExerciseId: activeExerciseTarget?.exerciseId ?? null,
            defaultToolLanguage: runtime.toolDefaults.defaultLang,
            showMobileWorkspaceTabs: shouldRenderStackedTools && !panels.showDesktopRight,
            desktopToolsVisible:
                panels.showDesktopRight && !panels.rightCollapsedEff,
            activeMobileWorkspaceTab,
            onMobileWorkspaceTabChange: setActiveMobileWorkspaceTab,
            subjectFinish,
            onBeforeCardNavigate: flushAll,
            onOpenCertificate: handleOpenCertificate,
            onActiveCardIndexChange: handleNavigateCardIndex,
            onNavigateToExerciseRoute: handleNavigateToExerciseRoute,
            onCompactQuizNavigationChange: handleCompactQuizNavigationChange,
            compactQuizNavigation,
            subjectRuntimeDefaults: topicStageRuntimeDefaults.subjectRuntimeDefaults,
            courseRuntimeDefaults: topicStageRuntimeDefaults.courseRuntimeDefaults,
            moduleRuntimeDefaults: topicStageRuntimeDefaults.moduleRuntimeDefaults,
            sectionRuntimeDefaults: topicStageRuntimeDefaults.sectionRuntimeDefaults,
            topicRuntimeDefaults: topicStageRuntimeDefaults.topicRuntimeDefaults,
        },
        moduleNav: {
            show: compactModeActive ? hasActiveTopic : !shouldHideModuleNavInCompactMode,
            compactSingleAction: compactModeActive && hasActiveTopic,
            singlePrevLabel: compactSinglePrevLabel,
            singlePrevDisabled: !compactSinglePrevEnabled,
            onSinglePrev: handleCompactSinglePrev,
            singleNextLabel: compactSingleNextLabel,
            singleNextDisabled: !compactSingleNextEnabled,
            singleNextLocked: compactSingleNextLocked,
            onSingleNext: handleCompactSingleNext,
            showNextModuleCta: atFinalModuleNavigationStep,
            locale,
            subjectSlug,
            prevModuleId: nav?.prevModuleId ?? null,
            nextModuleId: nav?.nextModuleId ?? null,
            nextLocked,
            nextBillingHref,
            canGoNext:
                Boolean(nav?.nextModuleId) && canGoNextModule,

            showCertificateCta: showFinalCertificateCta,

            canGetCertificate: canOpenCertificate,
            certificateLabel,
            certificateHint: subjectFinish?.message ?? null,
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
            dismissTopicToast: celebrations.dismissTopicToast,
        },

        courseDrawer: {
            open: courseModulesOpen,
            reduceMotion,
            onClose: () => setCourseModulesOpen(false),
            modules: nav?.modules ?? [],
            loading: navLoading,
            error: navError,
            onSelectModule: handleSelectCourseModule,
        },

        resetDialog: {
            open: confirmResetCurrentCard || resetFlow.confirmOpen,
            title: confirmResetCurrentCard
                ? (activeCardResetTarget?.dialogTitle ?? "Reset this exercise?")
                : resetFlow.pendingStats.title,
            description: confirmResetCurrentCard
                ? (activeCardResetTarget?.dialogDescription ??
                    "This will clear the current exercise and cannot be undone.")
                : resetFlow.pendingStats.description,
            onConfirm: confirmResetCurrentCard
                ? applyResetCurrentCard
                : resetFlow.applyPendingChange,
            onClose: confirmResetCurrentCard
                ? cancelResetCurrentCard
                : resetFlow.cancelPendingChange,
        },
    };
}
