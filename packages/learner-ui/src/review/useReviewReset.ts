import { useCallback, useMemo, useState, type Dispatch } from "react";

type PendingChange =
    | { kind: "module" }
    | { kind: "topic"; tid: string };

export type ReviewResetTopic = {
    id: string;
    cards?: readonly unknown[];
};

export type ReviewResetStats = {
    answeredCount: number;
    sessionSize: number;
};

export type ReviewResetInjectedOwners = {
    countAnswered: (
        cards: readonly unknown[],
        topicProgress: any,
        topicId: string,
    ) => ReviewResetStats;
    buildResetModuleProgress: (progress: any, firstTopicId: string) => any;
    buildResetTopicProgress: (progress: any, topicId: string) => any;
    resetModuleRuntimeToCanonicalState: () => unknown;
    resetTopicRuntimeToCanonicalState: (topicId: string) => unknown;
};

export type UseReviewResetArgs = ReviewResetInjectedOwners & {
    topics: readonly ReviewResetTopic[] | undefined;
    firstTopicId: string;
    progress: any;
    setProgress: Dispatch<any>;
    setActiveTopicId: (topicId: string) => void;
    setViewTopicId: (topicId: string) => void;
    flushNow: (
        next: any,
        options?: {
            keepalive?: boolean;
            reason?: string;
            mergeRuntime?: boolean;
            discardPendingSaves?: boolean;
        },
    ) => Promise<void> | void;
    onAfterResetModule?: () => void;
    onAfterResetTopic?: (topicId: string) => void;
    onResetStatusChange?: (value: string | null) => void;
};

type PendingStats = {
    answeredCount: number;
    sessionSize: number;
    title: string;
    description: string;
};

/**
 * Shared Review reset UI transaction.
 *
 * Canonical runtime state replacement is owned by @zoeskoul/learning-runtime.
 * This hook deliberately does NOT call the normal Tools unbind path before
 * reset: normal unbind flushes the mounted editor snapshot, which is the wrong
 * lifecycle for an authoritative reset.
 */
export function useReviewReset({
    topics,
    firstTopicId,
    progress,
    setProgress,
    setActiveTopicId,
    setViewTopicId,
    flushNow,
    countAnswered,
    buildResetModuleProgress,
    buildResetTopicProgress,
    resetModuleRuntimeToCanonicalState,
    resetTopicRuntimeToCanonicalState,
    onAfterResetModule,
    onAfterResetTopic,
    onResetStatusChange,
}: UseReviewResetArgs) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pending, setPending] = useState<PendingChange | null>(null);

    const safeTopics = Array.isArray(topics) ? topics : [];

    const pendingStats = useMemo<PendingStats>(() => {
        if (!pending) {
            return {
                answeredCount: 0,
                sessionSize: 0,
                title: "",
                description: "",
            };
        }

        if (pending.kind === "topic") {
            const topic = safeTopics.find((candidate) => candidate.id === pending.tid);
            const cards = Array.isArray(topic?.cards) ? topic.cards : [];
            const topicProgress = progress?.topics?.[pending.tid] ?? {};
            const stats = countAnswered(cards, topicProgress, pending.tid);

            return {
                answeredCount: stats.answeredCount,
                sessionSize: stats.sessionSize,
                title: "Reset this topic?",
                description: `You’ve completed ${stats.answeredCount}/${stats.sessionSize} items in this topic. This will clear this topic and cannot be undone.`,
            };
        }

        let answeredCount = 0;
        let sessionSize = 0;

        for (const topic of safeTopics) {
            const cards = Array.isArray(topic.cards) ? topic.cards : [];
            const topicProgress = progress?.topics?.[topic.id] ?? {};
            const stats = countAnswered(cards, topicProgress, topic.id);
            answeredCount += stats.answeredCount;
            sessionSize += stats.sessionSize;
        }

        return {
            answeredCount,
            sessionSize,
            title: "Reset the entire module?",
            description: `You’ve completed ${answeredCount}/${sessionSize} items in this module. This will clear everything and cannot be undone.`,
        };
    }, [countAnswered, pending, progress, safeTopics]);

    const cancelPendingChange = useCallback(() => {
        setConfirmOpen(false);
        setPending(null);
    }, []);

    const requestResetModule = useCallback(() => {
        setPending({ kind: "module" });
        setConfirmOpen(true);
    }, []);

    const requestResetTopic = useCallback((topicId: string) => {
        if (!topicId) return;
        setPending({ kind: "topic", tid: topicId });
        setConfirmOpen(true);
    }, []);

    const applyPendingChange = useCallback(async () => {
        if (!pending) return;

        if (pending.kind === "module") {
            resetModuleRuntimeToCanonicalState();

            const next = buildResetModuleProgress(progress, firstTopicId || "");

            setProgress(next);
            onResetStatusChange?.("Resetting this module...");

            /**
             * Reset persistence is part of the authoritative transaction.
             * Do not navigate until the reset document has reached the canonical
             * persistence owner; otherwise the destination route can hydrate the
             * pre-reset runtime/workspace from the server.
             */
            try {
                await Promise.resolve(
                    flushNow(next, {
                        reason: "reset-module",
                        mergeRuntime: false,
                        discardPendingSaves: true,
                    }),
                );
            } finally {
                onResetStatusChange?.(null);
            }

            setActiveTopicId(firstTopicId || "");
            setViewTopicId(firstTopicId || "");
            cancelPendingChange();

            queueMicrotask(() => {
                onAfterResetModule?.();
            });

            return;
        }

        const topicId = pending.tid;

        resetTopicRuntimeToCanonicalState(topicId);

        const next = buildResetTopicProgress(progress, topicId);

        setProgress(next);
        onResetStatusChange?.("Resetting this topic...");

        /**
         * Persist the empty topic runtime/progress before publishing the reset
         * route. A fire-and-forget save lets the next route hydrate stale code
         * that still exists on the server.
         */
        try {
            await Promise.resolve(
                flushNow(next, {
                    reason: "reset-topic",
                    mergeRuntime: false,
                    discardPendingSaves: true,
                }),
            );
        } finally {
            onResetStatusChange?.(null);
        }

        setActiveTopicId(topicId);
        setViewTopicId(topicId);
        cancelPendingChange();

        queueMicrotask(() => {
            onAfterResetTopic?.(topicId);
        });
    }, [
        pending,
        progress,
        firstTopicId,
        setProgress,
        setActiveTopicId,
        setViewTopicId,
        flushNow,
        cancelPendingChange,
        buildResetModuleProgress,
        buildResetTopicProgress,
        resetModuleRuntimeToCanonicalState,
        resetTopicRuntimeToCanonicalState,
        onAfterResetModule,
        onAfterResetTopic,
        onResetStatusChange,
    ]);

    return {
        confirmOpen,
        pendingStats,
        requestResetModule,
        requestResetTopic,
        cancelPendingChange,
        applyPendingChange,
    };
}
