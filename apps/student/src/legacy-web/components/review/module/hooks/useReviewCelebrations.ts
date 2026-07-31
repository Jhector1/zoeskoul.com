import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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

function getStreakMilestoneMessage(
    streak: number | null | undefined,
    t: ReturnType<typeof useTranslations>,
): string | null {
    if (!streak) return null;
    if (streak === 3) return t("streakMilestones.3");
    if (streak === 7) return t("streakMilestones.7");
    if (streak === 14) return t("streakMilestones.14");
    if (streak === 30) return t("streakMilestones.30");
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
    const t = useTranslations("review.celebration.copy");
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
        const title = t("module.title");
        const moduleLabel = String((mod as any)?.label ?? (mod as any)?.title ?? t("module.fallbackLabel"));
        const streak = gamificationSummary?.currentStreak ?? null;
        const streakMilestone = getStreakMilestoneMessage(streak, t);

        return {
            title,
            body: t("module.body", { moduleLabel }),
            streak,
            totalXp: gamificationSummary?.totalXp ?? null,
            streakMilestone,
        };
    }, [gamificationSummary, mod, t]);

    const courseCelebrateCopy = useMemo<CourseCelebrateCopy>(() => {
        const streak = gamificationSummary?.currentStreak ?? null;
        const totalXp = gamificationSummary?.totalXp ?? null;
        const streakMilestone = getStreakMilestoneMessage(streak, t);

        return {
            title: t("course.title"),
            body: t("course.body"),
            streak,
            totalXp,
            streakMilestone,
            ctaLabel: subjectFinish?.certificateIssued
                ? t("course.cta.viewCertificate")
                : t("course.cta.getCertificate"),
        };
    }, [gamificationSummary, subjectFinish, t]);

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

        for (const topic of safeTopics) {
            if (!currentCompletedTopics.has(topic.id)) continue;
            if (prevCompleted.has(topic.id)) continue;

            const streakIncreased =
                currentStreak != null &&
                (prevStreak == null || currentStreak > prevStreak);

            const milestoneMessage = streakIncreased
                ? getStreakMilestoneMessage(currentStreak, t)
                : null;

            newestToast = {
                id: `${topic.id}:${Date.now()}`,
                title: t("module.topicCompleteTitle"),
                message: streakIncreased
                    ? milestoneMessage ?? t("module.streakNow", { count: currentStreak })
                    : t("module.keepMomentum"),
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
    }, [gamificationSummary, progress, progressHydrated, safeTopics, subjectFinish, t]);

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
