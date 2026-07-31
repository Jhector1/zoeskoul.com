import type { ReviewCard } from "@/lib/subjects/types";

export function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}





import {
    getCardProgressKey,
    isCardDoneFromState,
    isQuizLikeCard,
} from "./progressKeys";

export function clamp01(n: number) {
    if (!Number.isFinite(n)) return 0;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return n;
}
export function languagesCompatible(a: unknown, b: unknown) {
    const left = String(a ?? "").trim().toLowerCase();
    const right = String(b ?? "").trim().toLowerCase();

    if (!left || !right) return true;
    if (left === right) return true;

    if (left === "py" && right === "python") return true;
    if (left === "python" && right === "py") return true;

    if (left === "js" && right === "javascript") return true;
    if (left === "javascript" && right === "js") return true;

    if (left === "ts" && right === "typescript") return true;
    if (left === "typescript" && right === "ts") return true;

    return false;
}
export function countAnswered(
    cards: readonly ReviewCard[],
    topicState: any,
    topicId: string,
) {
    const seen = new Set<string>();
    let answeredCount = 0;
    let sessionSize = 0;

    for (const card of cards) {
        const unitKey = isQuizLikeCard(card)
            ? `quiz:${card.id}`
            : `read:${getCardProgressKey(card)}`;

        if (seen.has(unitKey)) continue;
        seen.add(unitKey);

        sessionSize += 1;

        if (isCardDoneFromState(card, topicState)) {
            answeredCount += 1;
        }
    }

    return { answeredCount, sessionSize };
}

export function isTopicComplete(
    cards: readonly ReviewCard[],
    topicState: any,
    topicId: string,
) {
    const { answeredCount, sessionSize } = countAnswered(cards, topicState, topicId);
    return sessionSize > 0 && answeredCount >= sessionSize;
}

export function prereqsMetForAnyQuizOrProject(
    cards: readonly ReviewCard[],
    topicState: any,
    topicId: string,
) {
    for (const card of cards) {
        if (isQuizLikeCard(card)) return true;
        if (!isCardDoneFromState(card, topicState)) return false;
    }

    return true;
}