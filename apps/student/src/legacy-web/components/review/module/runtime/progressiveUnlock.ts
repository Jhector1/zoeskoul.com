import type { ReviewTargetEntry, ReviewTargetRegistry } from "./reviewTargetRegistry";
import { isCardDoneFromState } from "../progressKeys";
import {
    findReviewPracticeCompletionForExercise,
    isReviewPracticeStepComplete,
} from "../../quiz/projectPracticeCompletion";

function getTopicState(progress: any, topicId: string) {
    return progress?.topics?.[topicId] ?? {};
}

function doneLike(value: any) {
    return Boolean(
        value?.ok === true ||
        value?.correct === true ||
        value?.completed === true ||
        value?.done === true ||
        value?.passed === true ||
        value?.finalized === true ||
        value?.revealed === true ||
        value?.revealUsed === true ||
        value?.result?.finalized === true ||
        value?.result?.revealUsed === true ||
        value?.result?.revealAnswer != null,
    );
}

function getProjectPracticeCompletion(progress: any, entry: ReviewTargetEntry) {
    const quizState =
        getTopicState(progress, entry.topicId)?.quizState?.[entry.cardId] ?? {};

    return findReviewPracticeCompletionForExercise({
        exerciseId: entry.exerciseId ?? "",
        practiceMeta: quizState.practiceMeta ?? {},
        practiceItemPatch: quizState.practiceItemPatch ?? {},
    });
}

function getExerciseProgressState(progress: any, entry: ReviewTargetEntry) {
    const topic = getTopicState(progress, entry.topicId);
    const exerciseKey = entry.exerciseStateKey ?? entry.ownerKey;

    return (
        progress?.runtimeStateV2?.exercises?.[exerciseKey] ??
        topic?.runtimeStateV2?.exercises?.[exerciseKey] ??
        topic?.toolState?.[exerciseKey] ??
        topic?.exercises?.[exerciseKey] ??
        topic?.exerciseState?.[exerciseKey] ??
        null
    );
}

export function isReviewTargetComplete(args: {
    registry: ReviewTargetRegistry;
    progress: any;
    targetKey: string;
}) {
    const entry = args.registry.byKey[args.targetKey];
    if (!entry) return false;

    const topic = getTopicState(args.progress, entry.topicId);

    if (entry.ownerKind === "exercise") {
        if (topic?.quizzesDone?.[entry.cardId]) return true;

        const practiceCompletion = entry.exerciseId
            ? getProjectPracticeCompletion(args.progress, entry)
            : { meta: null, item: null };

        if (
            isReviewPracticeStepComplete({
                meta: practiceCompletion.meta,
                item: practiceCompletion.item,
            })
        ) {
            return true;
        }

        return doneLike(getExerciseProgressState(args.progress, entry));
    }

    if (entry.cardType === "quiz" || entry.cardType === "project") {
        return Boolean(topic?.quizzesDone?.[entry.cardId]);
    }

    return isCardDoneFromState(
        {
            id: entry.cardId,
            type: entry.cardType,
            tryIt: entry.tryIt ?? null,
        } as any,
        topic,
    );
}

export function getTargetKeyForRouteTarget(
    registry: ReviewTargetRegistry | null | undefined,
    target:
        | {
        sectionSlug?: string | null;
        topicSlug?: string | null;
        targetKind?: string | null;
        targetSlug?: string | null;
    }
        | null
        | undefined,
) {
    if (!registry || !target) return null;

    const { sectionSlug, topicSlug, targetKind, targetSlug } = target;

    if (!sectionSlug || !topicSlug || !targetKind || !targetSlug) {
        return null;
    }

    return (
        registry.byRoute[
            `${sectionSlug}/${topicSlug}/${targetKind}/${targetSlug}`
            ] ?? null
    );
}

export function computeProgressiveUnlock(args: {
    registry: ReviewTargetRegistry | null | undefined;
    progress: any;
    progressHydrated: boolean;
    unlockAll?: boolean;
}) {
    const registry = args.registry;
    const unlockedTargetKeys = new Set<string>();
    const lockedTargetKeys = new Set<string>();

    if (!registry) {
        return {
            orderedKeys: [] as string[],
            unlockedTargetKeys,
            lockedTargetKeys,
            earliestUnlockedTargetKey: null as string | null,
        };
    }

    /**
     * Do not lock anything before progress hydration. This avoids a temporary
     * client-side redirect to the wrong route before the real progress arrives.
     */
    if (args.unlockAll || !args.progressHydrated) {
        for (const key of registry.orderedKeys) {
            unlockedTargetKeys.add(key);
        }

        return {
            orderedKeys: registry.orderedKeys,
            unlockedTargetKeys,
            lockedTargetKeys,
            earliestUnlockedTargetKey: registry.orderedKeys[0] ?? null,
        };
    }

    let topLevelCanOpen = true;
    const previousExerciseCompleteByCard = new Map<string, boolean>();

    for (const key of registry.orderedKeys) {
        const entry = registry.byKey[key];

        if (!entry) continue;

        if (entry.ownerKind === "exercise") {
            const parentCardKey = `card:${entry.cardKey}`;
            const parentUnlocked = unlockedTargetKeys.has(parentCardKey);
            const previousExerciseComplete =
                previousExerciseCompleteByCard.get(entry.cardKey) ?? true;

            if (parentUnlocked && previousExerciseComplete) {
                unlockedTargetKeys.add(key);
            } else {
                lockedTargetKeys.add(key);
            }

            const currentExerciseComplete = isReviewTargetComplete({
                registry,
                progress: args.progress,
                targetKey: key,
            });

            previousExerciseCompleteByCard.set(entry.cardKey, currentExerciseComplete);
            continue;
        }

        if (topLevelCanOpen) {
            unlockedTargetKeys.add(key);
        } else {
            lockedTargetKeys.add(key);
        }

        const complete = isReviewTargetComplete({
            registry,
            progress: args.progress,
            targetKey: key,
        });

        if (!complete) {
            topLevelCanOpen = false;
        }
    }

    return {
        orderedKeys: registry.orderedKeys,
        unlockedTargetKeys,
        lockedTargetKeys,
        earliestUnlockedTargetKey:
            registry.orderedKeys.find((key) => unlockedTargetKeys.has(key)) ??
            registry.orderedKeys[0] ??
            null,
    };
}

export function firstRouteTargetForUnlockedTopic(args: {
    registry: ReviewTargetRegistry | null | undefined;
    topicId: string;
    unlockedTargetKeys: Set<string>;
}) {
    if (!args.registry) return null;

    const key = args.registry.orderedKeys.find((targetKey) => {
        const entry = args.registry?.byKey[targetKey];

        return (
            entry?.topicId === args.topicId &&
            args.unlockedTargetKeys.has(targetKey)
        );
    });

    return key ? args.registry.byKey[key] ?? null : null;
}

export function maxUnlockedCardIndexForTopic(args: {
    registry: ReviewTargetRegistry | null | undefined;
    topicId: string;
    viewCards: Array<{ id: string }>;
    unlockedTargetKeys: Set<string>;
}) {
    if (!args.registry) return 0;

    let max = 0;

    args.viewCards.forEach((card, index) => {
        const unlocked = args.registry?.orderedKeys.some((targetKey) => {
            const entry = args.registry?.byKey[targetKey];

            return (
                entry?.topicId === args.topicId &&
                entry.cardId === card.id &&
                args.unlockedTargetKeys.has(targetKey)
            );
        });

        if (unlocked) {
            max = Math.max(max, index);
        }
    });

    return max;
}