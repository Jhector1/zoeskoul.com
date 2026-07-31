import { useCallback, useMemo } from "react";
import type { ReviewModule } from "@/lib/subjects/types";
import { isTopicComplete } from "../utils";
import { isModuleTopicUnlocked } from "../runtime/courseProgressionPolicy";

type Args = {
    topics: ReviewModule["topics"] | undefined;
    unlockAll: boolean;
    progress: any;
    activeTopicId: string;
    setActiveTopicId: (tid: string) => void;
    viewTopicId: string;
    setViewTopicId: (tid: string) => void;
    onBeforeNavigate?: () => void | Promise<void>;
};

export function useReviewTopicFlow({
                                       topics,
                                       unlockAll,
                                       progress,
                                       activeTopicId,
                                       setActiveTopicId,
                                       viewTopicId,
                                       setViewTopicId,
                                       onBeforeNavigate,
                                   }: Args) {
    const safeTopics = Array.isArray(topics) ? topics : [];

    const activeIdx = useMemo(() => {
        const i = safeTopics.findIndex((t) => t.id === activeTopicId);
        return i < 0 ? 0 : i;
    }, [safeTopics, activeTopicId]);

    const topicUnlocked = useCallback(
        (tid: string) => {
            const idx = safeTopics.findIndex((x) => x.id === tid);
            if (idx < 0) return false;

            const prev = idx > 0 ? safeTopics[idx - 1] : null;
            const prevCards = Array.isArray(prev?.cards) ? prev.cards : [];
            const prevState = prev ? progress?.topics?.[prev.id] : null;
            const previousTopicComplete = prev
                ? isTopicComplete(prevCards, prevState, prev.id)
                : false;

            return isModuleTopicUnlocked({
                topicIndex: idx,
                previousTopicComplete,
                unlockAll,
            });
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
        async (tid: string) => {
            if (!tid) return;

            const idx = safeTopics.findIndex((x) => x.id === tid);
            if (idx < 0) return;

            if (!unlockAll) {
                const isEarlierOrActive = idx <= activeIdx;
                const canGoForward = topicUnlocked(tid);
                if (!isEarlierOrActive && !canGoForward) return;
            }

            if (onBeforeNavigate) await onBeforeNavigate();

            if (idx > activeIdx) setActiveTopicId(tid);
            setViewTopicId(tid);
        },
        [safeTopics, unlockAll, activeIdx, topicUnlocked, setActiveTopicId, setViewTopicId, onBeforeNavigate],
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