import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import type { SidebarTopicItemVm } from "./components/ModuleSidebar";
import { clamp01, isTopicComplete } from "./utils";

export function getViewTopic(
    topics: ReviewModule["topics"] | undefined,
    viewTopicId: string,
) {
    const safeTopics = Array.isArray(topics) ? topics : [];
    return safeTopics.find((t) => t.id === viewTopicId) ?? safeTopics[0] ?? null;
}

export function getViewCards(
    viewTopic: ReviewModule["topics"][number] | null | undefined,
): ReviewCard[] {
    return Array.isArray(viewTopic?.cards) ? (viewTopic.cards as ReviewCard[]) : [];
}

export function moduleCompleteFromProgress(
    progress: any,
    topics: ReviewModule["topics"] | undefined,
) {
    const safeTopics = Array.isArray(topics) ? topics : [];
    if (!safeTopics.length) return false;

    return safeTopics.every((t) => {
        const cards = Array.isArray(t.cards) ? t.cards : [];
        const tstate = progress?.topics?.[t.id];
        return isTopicComplete(cards, tstate, t.id);
    });
}

export function getModuleProgress(
    topics: ReviewModule["topics"] | undefined,
    progress: any,
) {
    const safeTopics = Array.isArray(topics) ? topics : [];
    const total = safeTopics.length;

    const done = safeTopics.reduce((acc, t) => {
        const tstate = progress?.topics?.[t.id];
        const cards = Array.isArray(t.cards) ? t.cards : [];
        return acc + (isTopicComplete(cards, tstate, t.id) ? 1 : 0);
    }, 0);

    return {
        total,
        done,
        pct: total ? clamp01(done / total) : 0,
    };
}

type GetSidebarTopicItemsArgs = {
    topics: ReviewModule["topics"] | undefined;
    activeIdx: number;
    activeTopicId: string;
    viewTopicId: string;
    topicUnlocked: (tid: string) => boolean;
    unlockAll: boolean;
    progressHydrated: boolean;
    progress: any;
};

export function getSidebarTopicItems({
                                         topics,
                                         activeIdx,
                                         activeTopicId,
                                         viewTopicId,
                                         topicUnlocked,
                                         unlockAll,
                                         progressHydrated,
                                         progress,
                                     }: GetSidebarTopicItemsArgs): SidebarTopicItemVm[] {
    const safeTopics = Array.isArray(topics) ? topics : [];

    return safeTopics.map((t, idx) => {
        const isEarlierOrActive = idx <= activeIdx;
        const canGoForward = topicUnlocked(t.id);
        const disabled = unlockAll ? false : !isEarlierOrActive && !canGoForward;

        const done = progressHydrated
            ? isTopicComplete((t.cards ?? []) as ReviewCard[], progress?.topics?.[t.id], t.id)
            : false;
        const firstCard = Array.isArray(t.cards) ? t.cards[0] : null;
        const firstCardTitle =
            typeof firstCard?.title === "string" && firstCard.title.trim()
                ? firstCard.title
                : null;

        return {
            id: t.id,
            label: t.label ?? "",
            summary: t.summary ?? null,
            firstCardTitle,
            disabled,
            done,
            isViewing: viewTopicId === t.id,
            isActive: activeTopicId === t.id,
        };
    });
}