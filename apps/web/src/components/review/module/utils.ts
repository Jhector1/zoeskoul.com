import type { ReviewCard } from "@/lib/subjects/types";

export function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

function isQuizLike(c: ReviewCard) {
    return c.type === "quiz" || c.type === "project";
}

export function isTopicComplete(topicCards: ReviewCard[], tstate: any) {
    const cardsDone = tstate?.cardsDone ?? {};
    const quizzesDone = tstate?.quizzesDone ?? {};

    for (const c of topicCards) {
        if (isQuizLike(c)) {
            if (!quizzesDone[c.id]) return false;
        } else {
            if (!cardsDone[c.id]) return false;
        }
    }
    return true;
}

/**
 * Prereqs for a quiz: all earlier "read/watch/sketch" style items must be done.
 * (Quiz/project items should NOT be prereqs here.)
 */
// export function prereqsMetForQuiz(cards: ReviewCard[], tp: any, quizCardId: string) {
//     const idx = cards.findIndex((c) => c.id === quizCardId);
//     if (idx < 0) return true;
//
//     const prereqCards = cards.slice(0, idx).filter((c) => !isQuizLike(c));
//     return prereqCards.every((c) => Boolean(tp?.cardsDone?.[c.id]));
// }

/**
 * Gate for ANY quiz/project in this topic:
 * All non-quiz items (text/video/sketch/...) must be marked done first.
 */
export function prereqsMetForAnyQuizOrProject(cards: ReviewCard[], tp: any) {
    const prereqCards = cards.filter((c) => !isQuizLike(c));
    return prereqCards.every((c) => Boolean(tp?.cardsDone?.[c.id]));
}

export function countAnswered(cards: ReviewCard[], tstate: any) {
    let answered = 0;

    for (const c of cards) {
        const done = isQuizLike(c)
            ? Boolean(tstate?.quizzesDone?.[c.id])
            : Boolean(tstate?.cardsDone?.[c.id]);

        if (done) answered++;
    }

    return { answeredCount: answered, sessionSize: cards.length };
}