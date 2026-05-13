import { describe, expect, it } from "vitest";
import { PracticeKind } from "@zoeskoul/db";
import {
    filterPoolByPreferKind,
    filterPoolByPurpose,
    filterPoolForPurposeAndKind,
    readPoolFromTopicMeta,
} from "@/lib/review/api/quiz/helpers";

describe("review quiz pool helpers", () => {
    it("preserves purpose from topic meta", () => {
        const pool = readPoolFromTopicMeta({
            pool: [
                { key: "quiz-a", w: 1, kind: "single_choice", purpose: "quiz" },
                { key: "project-a", w: 1, kind: "code_input", purpose: "project" },
            ],
        });

        expect(pool).toEqual([
            { key: "quiz-a", w: 1, kind: "single_choice", purpose: "quiz" },
            { key: "project-a", w: 1, kind: "code_input", purpose: "project" },
        ]);
    });

    it("defaults missing purpose to quiz for legacy pool items", () => {
        const pool = readPoolFromTopicMeta({
            pool: [{ key: "legacy-a", w: 1, kind: "drag_reorder" }],
        });

        expect(pool).toEqual([
            { key: "legacy-a", w: 1, kind: "drag_reorder", purpose: "quiz" },
        ]);
    });

    it("normal quiz selection with preferKind null returns only quiz-purpose items", () => {
        const pool = readPoolFromTopicMeta({
            pool: [
                { key: "sc-a", w: 1, kind: "single_choice", purpose: "quiz" },
                { key: "drag-a", w: 1, kind: "drag_reorder", purpose: "quiz" },
                { key: "ci-project", w: 1, kind: "code_input", purpose: "project" },
            ],
        });

        expect(
            filterPoolForPurposeAndKind(pool, "quiz", null).map((item) => item.key),
        ).toEqual(["sc-a", "drag-a"]);
    });

    it("normal quiz selection excludes project-purpose code_input items", () => {
        const pool = readPoolFromTopicMeta({
            pool: [
                { key: "ci-project", w: 1, kind: "code_input", purpose: "project" },
                { key: "quiz-text", w: 1, kind: "text_input", purpose: "quiz" },
            ],
        });

        expect(
            filterPoolForPurposeAndKind(pool, "quiz", null).map((item) => item.key),
        ).toEqual(["quiz-text"]);
    });

    it("project selection returns project-purpose code_input items", () => {
        const pool = readPoolFromTopicMeta({
            pool: [
                { key: "ci-project", w: 1, kind: "code_input", purpose: "project" },
                { key: "quiz-text", w: 1, kind: "text_input", purpose: "quiz" },
            ],
        });

        expect(
            filterPoolForPurposeAndKind(pool, "project", PracticeKind.code_input).map(
                (item) => item.key,
            ),
        ).toEqual(["ci-project"]);
    });

    it("allows quiz-purpose code_input when quiz mode prefers code_input", () => {
        const pool = readPoolFromTopicMeta({
            pool: [
                { key: "ci-quiz", w: 1, kind: "code_input", purpose: "quiz" },
                { key: "ci-project", w: 1, kind: "code_input", purpose: "project" },
            ],
        });

        expect(
            filterPoolForPurposeAndKind(pool, "quiz", PracticeKind.code_input).map(
                (item) => item.key,
            ),
        ).toEqual(["ci-quiz"]);
    });

    it("preferKind narrows inside the purpose-filtered pool", () => {
        const pool = readPoolFromTopicMeta({
            pool: [
                { key: "quiz-code", w: 1, kind: "code_input", purpose: "quiz" },
                { key: "project-code", w: 1, kind: "code_input", purpose: "project" },
                { key: "quiz-single", w: 1, kind: "single_choice", purpose: "quiz" },
            ],
        });

        const quizPool = filterPoolByPurpose(pool, "quiz");
        const quizCodePool = filterPoolByPreferKind(quizPool, PracticeKind.code_input);

        expect(quizPool.map((item) => item.key)).toEqual(["quiz-code", "quiz-single"]);
        expect(quizCodePool.map((item) => item.key)).toEqual(["quiz-code"]);
    });

    it("documents the stale-data debugging path for future regressions", () => {
        const note =
            "If code_input appears in a normal quiz after this change, check for stale reviewQuizInstance rows or stale PracticeTopic.meta.pool without purpose. Run sync:curriculum and reset quiz.";

        expect(note).toContain("sync:curriculum");
    });
});
