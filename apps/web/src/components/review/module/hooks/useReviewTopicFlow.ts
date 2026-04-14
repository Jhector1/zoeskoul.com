import { useCallback, useMemo } from "react";
import type { ReviewModule } from "@/lib/subjects/types";
import { isTopicComplete } from "../utils";

type Args = {
    topics: ReviewModule["topics"] | undefined;
    unlockAll: boolean;
    progress: any;
    activeTopicId: string;
    setActiveTopicId: (tid: string) => void;
    viewTopicId: string;
    setViewTopicId: (tid: string) => void;
};

export function useReviewTopicFlow({
                                       topics,
                                       unlockAll,
                                       progress,
                                       activeTopicId,
                                       setActiveTopicId,
                                       viewTopicId,
                                       setViewTopicId,
                                   }: Args) {
    const safeTopics = Array.isArray(topics) ? topics : [];

    const activeIdx = useMemo(() => {
        const i = safeTopics.findIndex((t) => t.id === activeTopicId);
        return i < 0 ? 0 : i;
    }, [safeTopics, activeTopicId]);

    const topicUnlocked = useCallback(
        (tid: string) => {
            if (unlockAll) return true;

            const idx = safeTopics.findIndex((x) => x.id === tid);
            if (idx <= 0) return true;

            const prev = safeTopics[idx - 1];
            const prevCards = Array.isArray(prev.cards) ? prev.cards : [];
            const prevState = progress?.topics?.[prev.id];

            return isTopicComplete(prevCards, prevState, prev.id);
        },
        [safeTopics, progress, unlockAll],
    );

    const viewIdx = useMemo(
        () => safeTopics.findIndex((t) => t.id === viewTopicId),
        [safeTopics, viewTopicId],
    );

    const prevTopic = viewIdx > 0 ? safeTopics[viewIdx - 1] : null;
    const nextTopic = viewIdx >= 0 ? safeTopics[viewIdx + 1] : null;

    const goToTopic = useCallback(
        (tid: string) => {
            if (!tid) return;

            const idx = safeTopics.findIndex((x) => x.id === tid);
            if (idx < 0) return;

            if (!unlockAll) {
                const isEarlierOrActive = idx <= activeIdx;
                const canGoForward = topicUnlocked(tid);
                if (!isEarlierOrActive && !canGoForward) return;
            }

            if (idx > activeIdx) setActiveTopicId(tid);
            setViewTopicId(tid);
        },
        [safeTopics, unlockAll, activeIdx, topicUnlocked, setActiveTopicId, setViewTopicId],
    );

    const goPrevTopic = useCallback(() => {
        if (!prevTopic?.id) return;
        goToTopic(prevTopic.id);
    }, [prevTopic?.id, goToTopic]);

    const goNextTopic = useCallback(() => {
        if (!nextTopic?.id) return;
        goToTopic(nextTopic.id);
    }, [nextTopic?.id, goToTopic]);

    return {
        activeIdx,
        topicUnlocked,
        viewIdx,
        prevTopic,
        nextTopic,
        goToTopic,
        goPrevTopic,
        goNextTopic,
    };
}