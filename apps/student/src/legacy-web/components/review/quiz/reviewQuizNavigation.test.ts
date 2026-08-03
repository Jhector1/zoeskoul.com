import { describe, expect, it } from "vitest";
import { resolveReviewQuizRestoreIndex } from "./reviewQuizNavigation";

describe("resolveReviewQuizRestoreIndex", () => {
    it("starts a completed multi-question quiz at question one for review navigation", () => {
        expect(
            resolveReviewQuizRestoreIndex({
                questionCount: 4,
                routeExerciseIndex: -1,
                isCompleted: true,
                firstIncompleteUnlockedIndex: -1,
                lastUnlockedIndex: 3,
            }),
        ).toBe(0);
    });

    it("keeps an explicit exercise route as the source of truth", () => {
        expect(
            resolveReviewQuizRestoreIndex({
                questionCount: 4,
                routeExerciseIndex: 2,
                isCompleted: true,
                firstIncompleteUnlockedIndex: -1,
                lastUnlockedIndex: 3,
            }),
        ).toBe(2);
    });

    it("resumes an unfinished quiz at the first incomplete unlocked question", () => {
        expect(
            resolveReviewQuizRestoreIndex({
                questionCount: 4,
                routeExerciseIndex: -1,
                isCompleted: false,
                firstIncompleteUnlockedIndex: 1,
                lastUnlockedIndex: 1,
            }),
        ).toBe(1);
    });

    it("falls back to the last unlocked question when no incomplete question exists", () => {
        expect(
            resolveReviewQuizRestoreIndex({
                questionCount: 4,
                routeExerciseIndex: -1,
                isCompleted: false,
                firstIncompleteUnlockedIndex: -1,
                lastUnlockedIndex: 2,
            }),
        ).toBe(2);
    });

    it("ignores an invalid explicit route index", () => {
        expect(
            resolveReviewQuizRestoreIndex({
                questionCount: 3,
                routeExerciseIndex: 9,
                isCompleted: false,
                firstIncompleteUnlockedIndex: 1,
                lastUnlockedIndex: 1,
            }),
        ).toBe(1);
    });

    it("returns zero for an empty quiz", () => {
        expect(
            resolveReviewQuizRestoreIndex({
                questionCount: 0,
                routeExerciseIndex: -1,
                isCompleted: false,
                firstIncompleteUnlockedIndex: -1,
                lastUnlockedIndex: -1,
            }),
        ).toBe(0);
    });
});
