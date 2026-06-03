import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewModule } from "@/lib/subjects/types";
import { moduleCompleteFromProgress } from "../selectors";
import { isTopicComplete } from "../utils";

const TOPIC_TOAST_MS = 4200;

export type TopicCelebrateToast = {
    id: string;
    title: string;
    message: string;
    streak?: number | null;
    xp?: number | null;
};

export type CelebrateCopy = {
    title: string;
    body: string;
    streak: number | null;
    totalXp: number | null;
    streakMilestone: string | null;
};

export type CourseCelebrateCopy = CelebrateCopy & {
    ctaLabel: string;
};

type GamificationSummaryLike = {
    currentStreak?: number | null;
    totalXp?: number | null;
} | null | undefined;

type SubjectFinishLike = {
    status?: string | null;
    certificateIssued?: boolean | null;
} | null | undefined;

type UseReviewCelebrationsArgs = {
    progressHydrated: boolean;
    progress: any;
    topics: ReviewModule["topics"] | undefined;
    gamificationSummary: GamificationSummaryLike;
    subjectFinish: SubjectFinishLike;
    mod: ReviewModule;
};

function getStreakMilestoneMessage(streak: number | null | undefined): string | null {
    if (!streak) return null;
    if (streak === 3) return "You’re building consistency.";
    if (streak === 7) return "A full week — strong work.";
    if (streak === 14) return "Two weeks in a row. Keep it alive.";
    if (streak === 30) return "30 days — that’s real discipline.";
    return null;
}

export function useReviewCelebrations({
                                          progressHydrated,
                                          progress,
                                          topics,
                                          gamificationSummary,
                                          subjectFinish,
                                          mod,
                                      }: UseReviewCelebrationsArgs) {
    const [topicToast, setTopicToast] = useState<TopicCelebrateToast | null>(null);
    const [topicToastPaused, setTopicToastPaused] = useState(false);

    const [moduleCelebrateOpen, setModuleCelebrateOpen] = useState(false);

    const [courseCelebrateOpen, setCourseCelebrateOpen] = useState(false);
    const [courseCelebrateBurstKey, setCourseCelebrateBurstKey] = useState(0);

    const celebrationsBootstrappedRef = useRef(false);
    const prevCompletedTopicsRef = useRef<Set<string>>(new Set());
    const prevModuleCompleteRef = useRef(false);
    const prevStreakRef = useRef<number | null>(null);
    const prevCourseCompleteRef = useRef(false);

    const safeTopics = Array.isArray(topics) ? topics : [];

    const moduleCelebrateCopy = useMemo<CelebrateCopy>(() => {
        const title = "Module complete";
        const moduleLabel = String((mod as any)?.label ?? (mod as any)?.title ?? "this module");
        const streak = gamificationSummary?.currentStreak ?? null;
        const streakMilestone = getStreakMilestoneMessage(streak);

        return {
            title,
            body: `Great job — you finished ${moduleLabel}.`,
            streak,
            totalXp: gamificationSummary?.totalXp ?? null,
            streakMilestone,
        };
    }, [mod, gamificationSummary]);

    const courseCelebrateCopy = useMemo<CourseCelebrateCopy>(() => {
        const streak = gamificationSummary?.currentStreak ?? null;
        const totalXp = gamificationSummary?.totalXp ?? null;
        const streakMilestone = getStreakMilestoneMessage(streak);

        return {
            title: "Course complete",
            body: "You finished the full course. Nice work — this is a real milestone.",
            streak,
            totalXp,
            streakMilestone,
            ctaLabel: subjectFinish?.certificateIssued ? "View certificate" : "Get certificate",
        };
    }, [gamificationSummary, subjectFinish]);

    useEffect(() => {
        const courseComplete =
            subjectFinish?.status === "certificate_ready" ||
            subjectFinish?.status === "certificate_issued";

        if (!celebrationsBootstrappedRef.current) {
            prevCourseCompleteRef.current = courseComplete;
            return;
        }

        if (courseComplete && !prevCourseCompleteRef.current) {
            setCourseCelebrateBurstKey((k) => k + 1);
            setCourseCelebrateOpen(true);
        }

        prevCourseCompleteRef.current = courseComplete;
    }, [subjectFinish]);

    useEffect(() => {
        if (!progressHydrated || !safeTopics.length) return;

        const currentCompletedTopics = new Set<string>();
        for (const t of safeTopics) {
            const cards = Array.isArray(t.cards) ? t.cards : [];
            const tstate = progress?.topics?.[t.id];
            if (isTopicComplete(cards, tstate, t.id)) currentCompletedTopics.add(t.id);
        }

        const currentModuleComplete = moduleCompleteFromProgress(progress, safeTopics);
        const currentStreak = gamificationSummary?.currentStreak ?? null;

        if (!celebrationsBootstrappedRef.current) {
            prevCompletedTopicsRef.current = currentCompletedTopics;
            prevModuleCompleteRef.current = currentModuleComplete;
            prevStreakRef.current = currentStreak;
            celebrationsBootstrappedRef.current = true;
            return;
        }

        let newestToast: TopicCelebrateToast | null = null;
        const prevCompleted = prevCompletedTopicsRef.current;
        const prevStreak = prevStreakRef.current;

        for (const t of safeTopics) {
            if (!currentCompletedTopics.has(t.id)) continue;
            if (prevCompleted.has(t.id)) continue;

            const streakIncreased =
                currentStreak != null &&
                (prevStreak == null || currentStreak > prevStreak);

            const milestoneMessage = streakIncreased
                ? getStreakMilestoneMessage(currentStreak)
                : null;

            newestToast = {
                id: `${t.id}:${Date.now()}`,
                title: "Nice — topic complete",
                message: streakIncreased
                    ? milestoneMessage ?? `Your streak is now ${currentStreak}.`
                    : "You finished this topic. Keep the momentum going.",
                streak: streakIncreased ? currentStreak : null,
                xp: null,
            };
        }

        if (newestToast) {
            setTopicToast(newestToast);
        }

        if (currentModuleComplete && !prevModuleCompleteRef.current) {
            const courseCompleteSoon =
                subjectFinish?.status === "certificate_ready" ||
                subjectFinish?.status === "certificate_issued";

            if (!courseCompleteSoon) {
                setModuleCelebrateOpen(true);
            }
        }

        prevCompletedTopicsRef.current = currentCompletedTopics;
        prevModuleCompleteRef.current = currentModuleComplete;
        prevStreakRef.current = currentStreak;
    }, [progressHydrated, progress, safeTopics, gamificationSummary, subjectFinish]);

    useEffect(() => {
        if (!topicToast || topicToastPaused) return;
        const t = window.setTimeout(() => setTopicToast(null), TOPIC_TOAST_MS);
        return () => window.clearTimeout(t);
    }, [topicToast, topicToastPaused]);

    function dismissTopicToast() {
        setTopicToast(null);
        setTopicToastPaused(false);
    }

    return {
        topicToast,
        topicToastPaused,
        setTopicToastPaused,
        dismissTopicToast,
        moduleCelebrateOpen,
        setModuleCelebrateOpen,
        courseCelebrateOpen,
        setCourseCelebrateOpen,
        courseCelebrateBurstKey,
        moduleCelebrateCopy,
        courseCelebrateCopy,
    };
}
