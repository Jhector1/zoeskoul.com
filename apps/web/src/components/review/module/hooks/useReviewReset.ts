import { useCallback, useMemo, useState } from "react";
import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import { countAnswered } from "../utils";
import { buildResetModuleProgress, buildResetTopicProgress } from "../actions";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import { clearReviewWorkspaceDrafts } from "@/components/tools/panes/reviewWorkspaceDrafts";

type PendingChange =
    | { kind: "module" }
    | { kind: "topic"; tid: string };

type PendingStats = {
    answeredCount: number;
    sessionSize: number;
    title: string;
    description: string;
};

type UseReviewResetArgs = {
    topics: ReviewModule["topics"] | undefined;
    firstTopicId: string;
    progress: any;
    setProgress: React.Dispatch<any>;
    setActiveTopicId: (tid: string) => void;
    setViewTopicId: (tid: string) => void;
    flushNow: (next: any) => void;
    toolUnbindCodeInput: () => void;
    onAfterResetModule?: () => void;
    onAfterResetTopic?: (topicId: string) => void;
};

export function useReviewReset({
                                   topics,
                                   firstTopicId,
                                   progress,
                                   setProgress,
                                   setActiveTopicId,
                                   setViewTopicId,
                                   flushNow,
                                   toolUnbindCodeInput,
                                   onAfterResetModule,
                                   onAfterResetTopic,
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
            const topic = safeTopics.find((t) => t.id === pending.tid);
            const cards = (topic?.cards ?? []) as ReviewCard[];
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
            const cards = (topic.cards ?? []) as ReviewCard[];
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
    }, [pending, progress, safeTopics]);

    const cancelPendingChange = useCallback(() => {
        setConfirmOpen(false);
        setPending(null);
    }, []);

    const requestResetModule = useCallback(() => {
        setPending({ kind: "module" });
        setConfirmOpen(true);
    }, []);

    const requestResetTopic = useCallback((tid: string) => {
        if (!tid) return;

        setPending({ kind: "topic", tid });
        setConfirmOpen(true);
    }, []);

    const applyPendingChange = useCallback(() => {
        if (!pending) return;

        toolUnbindCodeInput();

        if (pending.kind === "module") {
            useReviewRuntimeStore.getState().clearRuntimeForModule();
            clearReviewWorkspaceDrafts();

            const next = buildResetModuleProgress(progress, firstTopicId || "");

            setProgress(next);
            setActiveTopicId(firstTopicId || "");
            setViewTopicId(firstTopicId || "");
            flushNow(next);
            cancelPendingChange();

            queueMicrotask(() => {
                onAfterResetModule?.();
            });

            return;
        }

        const tid = pending.tid;

        useReviewRuntimeStore.getState().clearRuntimeForTopic(tid);
        clearReviewWorkspaceDrafts();

        const next = buildResetTopicProgress(progress, tid);

        setProgress(next);
        flushNow(next);

        setActiveTopicId(tid);
        setViewTopicId(tid);
        cancelPendingChange();

        queueMicrotask(() => {
            onAfterResetTopic?.(tid);
        });
    }, [
        pending,
        toolUnbindCodeInput,
        progress,
        firstTopicId,
        setProgress,
        setActiveTopicId,
        setViewTopicId,
        flushNow,
        cancelPendingChange,
        progress,
        onAfterResetModule,
        onAfterResetTopic,
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
