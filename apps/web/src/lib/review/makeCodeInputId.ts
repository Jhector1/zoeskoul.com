// src/lib/review/makeCodeInputId.ts
export function makeCodeInputId(quizCardId: string, questionId: string) {
    // Stable, globally unique within a topic view
    // (avoid collisions when multiple quizzes exist on the same page)
    return `codeinput:${quizCardId}:${questionId}`;
}