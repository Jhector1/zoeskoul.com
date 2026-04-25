import { describe, expect, it } from "vitest";
import {
    buildExerciseMessageKeys,
    buildQualifiedMessageBase,
    buildTopicMessagePrefix,
    deriveExerciseLocalMessageBase,
} from "./buildMessageKeys.js";

describe("buildMessageKeys", () => {
    it("derives a local messageBase from exercise id when missing", () => {
        expect(deriveExerciseLocalMessageBase("single-1")).toBe("quiz.single-1");
        expect(deriveExerciseLocalMessageBase("fill-blank-2")).toBe("quiz.fill-blank-2");
    });

    it("preserves a valid topic-local messageBase override", () => {
        expect(
            deriveExerciseLocalMessageBase("single-1", "quiz.table-definition"),
        ).toBe("quiz.table-definition");
    });

    it("rejects fully qualified messageBase values", () => {
        expect(() =>
            deriveExerciseLocalMessageBase(
                "single-1",
                "topics.sql.sql_module_0.what-sql-means.quiz.single-1",
            ),
        ).toThrow(/topic-local/i);
    });

    it("builds the topic message prefix correctly", () => {
        expect(
            buildTopicMessagePrefix({
                subjectSlug: "sql",
                moduleSlug: "sql_module_0",
                topicId: "what-sql-means",
            }),
        ).toBe("topics.sql.sql_module_0.what-sql-means");
    });

    it("builds a fully qualified message base from local messageBase", () => {
        expect(
            buildQualifiedMessageBase({
                scope: {
                    subjectSlug: "sql",
                    moduleSlug: "sql_module_0",
                    topicId: "what-sql-means",
                },
                localMessageBase: "quiz.single-1",
            }),
        ).toBe("topics.sql.sql_module_0.what-sql-means.quiz.single-1");
    });

    it("builds all exercise keys from scope + local messageBase", () => {
        const result = buildExerciseMessageKeys({
            scope: {
                subjectSlug: "sql",
                moduleSlug: "sql_module_0",
                topicId: "what-sql-means",
            },
            exerciseId: "single-1",
            optionIds: ["a", "b", "c", "d"],
        });

        expect(result.localMessageBase).toBe("quiz.single-1");
        expect(result.qualifiedBase).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1",
        );
        expect(result.titleKey).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1.title",
        );
        expect(result.promptKey).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1.prompt",
        );
        expect(result.hintKey).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1.hint",
        );
        expect(result.help.conceptKey).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1.help.concept",
        );
        expect(result.help.hint1Key).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1.help.hint_1",
        );
        expect(result.help.hint2Key).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1.help.hint_2",
        );
        expect(result.optionKeys).toEqual({
            a: "topics.sql.sql_module_0.what-sql-means.quiz.single-1.options.a",
            b: "topics.sql.sql_module_0.what-sql-means.quiz.single-1.options.b",
            c: "topics.sql.sql_module_0.what-sql-means.quiz.single-1.options.c",
            d: "topics.sql.sql_module_0.what-sql-means.quiz.single-1.options.d",
        });
    });
});