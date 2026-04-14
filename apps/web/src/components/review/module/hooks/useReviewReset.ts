import { useCallback, useMemo, useState } from "react";
import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import { countAnswered } from "../utils";
import { buildResetModuleProgress, buildResetTopicProgress } from "../actions";

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
                               }: UseReviewResetArgs) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pending, setPending] = useState<PendingChange | null>(null);

    const safeTopics = Array.isArray(topics) ? topics : [];

    const pendingStats = useMemo<PendingStats>(() => {
        if (!pending) {
            return { answeredCount: 0, sessionSize: 0, title: "", description: "" };
        }

        if (pending.kind === "topic") {
            const tid = pending.tid ?? "";
            const cards = (safeTopics.find((t) => t.id === tid)?.cards ?? []) as ReviewCard[];
            const tp0 = progress?.topics?.[tid] ?? {};
            const { answeredCount, sessionSize } = countAnswered(cards, tp0, tid);

            return {
                answeredCount,
                sessionSize,
                title: "Reset this topic?",
                description: `You’ve completed ${answeredCount}/${sessionSize} items in this topic. This will clear them and cannot be undone.`,
            };
        }

        let answeredCount = 0;
        let sessionSize = 0;

        for (const t of safeTopics) {
            const cards = (t.cards ?? []) as ReviewCard[];
            const tp0 = progress?.topics?.[t.id] ?? {};
            const r = countAnswered(cards, tp0, t.id);
            answeredCount += r.answeredCount;
            sessionSize += r.sessionSize;
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
            const next = buildResetModuleProgress(progress, firstTopicId || "");
            setProgress(next);
            setActiveTopicId(firstTopicId || "");
            setViewTopicId(firstTopicId || "");
            flushNow(next);
            cancelPendingChange();
            return;
        }

        const tid = pending.tid ?? "";
        if (!tid) {
            cancelPendingChange();
            return;
        }

        setProgress((p: any) => {
            const next = buildResetTopicProgress(p, tid);
            flushNow(next);
            return next;
        });

        cancelPendingChange();
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