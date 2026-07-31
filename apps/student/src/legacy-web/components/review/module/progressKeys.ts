





import type { ReviewCard, ReviewEmbeddedTryIt } from "@/lib/subjects/types";

export function isQuizLikeCard(card: ReviewCard) {
    return card.type === "quiz" || card.type === "project";
}

export function getCardProgressKey(card: ReviewCard): string {
    const explicit = String(card.progressKey ?? "").trim();
    if (explicit) return explicit;

    // Default: every card tracks its own progress.
    return card.id;
}

export function getCardProgressAliases(card: ReviewCard): string[] {
    const out = new Set<string>();

    out.add(getCardProgressKey(card));
    out.add(card.id);

    for (const key of card.legacyProgressKeys ?? []) {
        const k = String(key ?? "").trim();
        if (k) out.add(k);
    }

    return [...out];
}

export function getEmbeddedTryIt(card: ReviewCard): ReviewEmbeddedTryIt | null {
    const value = (card as { tryIt?: unknown }).tryIt;
    if (!value || typeof value !== "object") return null;

    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const exerciseKey = typeof record.exerciseKey === "string" ? record.exerciseKey.trim() : "";
    const spec = record.spec && typeof record.spec === "object" ? record.spec : null;

    if (!id || !exerciseKey || !spec) return null;

    return value as ReviewEmbeddedTryIt;
}

export function hasRequiredEmbeddedTryIt(card: ReviewCard) {
    const tryIt = getEmbeddedTryIt(card);
    return Boolean(tryIt && tryIt.required !== false);
}

export function isEmbeddedTryItDoneFromState(card: ReviewCard, topicState: any) {
    const tryIt = getEmbeddedTryIt(card);
    if (!tryIt) return true;
    if (tryIt.required === false) return true;
    return Boolean(topicState?.quizzesDone?.[tryIt.id]);
}

export function canAutoMarkReadingCardDone(card: ReviewCard, topicState: any) {
    if (isQuizLikeCard(card)) return false;
    return isEmbeddedTryItDoneFromState(card, topicState);
}

export function isCardDoneFromState(card: ReviewCard, topicState: any): boolean {
    if (isQuizLikeCard(card)) {
        return Boolean(topicState?.quizzesDone?.[card.id]);
    }

    if (!isEmbeddedTryItDoneFromState(card, topicState)) {
        return false;
    }

    const aliases = getCardProgressAliases(card);

    return aliases.some(
        (key) =>
            Boolean(topicState?.readingDone?.[key]) ||
            Boolean(topicState?.cardsDone?.[key]),
    );
}

export function markCardDoneInTopicState(topicState: any, card: ReviewCard) {
    if (isQuizLikeCard(card)) {
        return {
            ...topicState,
            quizzesDone: {
                ...(topicState?.quizzesDone ?? {}),
                [card.id]: true,
            },
        };
    }

    if (!isEmbeddedTryItDoneFromState(card, topicState)) {
        return topicState ?? {};
    }

    const canonical = getCardProgressKey(card);

    return {
        ...topicState,
        readingDone: {
            ...(topicState?.readingDone ?? {}),
            [canonical]: true,
        },
    };
}

export function normalizeTopicProgressForCards(
    topicState: any,
    cards: readonly ReviewCard[],
) {
    const cur = topicState ?? {};
    const nextReadingDone = { ...(cur.readingDone ?? {}) };
    let changed = false;

    for (const card of cards) {
        if (isQuizLikeCard(card)) continue;

        const canonical = getCardProgressKey(card);
        if (nextReadingDone[canonical]) continue;

        const aliases = getCardProgressAliases(card);
        const oldDone = aliases.some(
            (key) =>
                Boolean(cur?.readingDone?.[key]) ||
                Boolean(cur?.cardsDone?.[key]),
        );

        if (oldDone) {
            nextReadingDone[canonical] = true;
            changed = true;
        }
    }

    if (!changed) return cur;

    return {
        ...cur,
        readingDone: nextReadingDone,
    };
}
