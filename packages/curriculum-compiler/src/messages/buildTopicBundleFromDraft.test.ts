import { describe, expect, it } from "vitest";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";

function makeShapePack() {
    return {
        profileId: "sql",
        subjectManifest: {
            moduleSlug: (moduleOrder: number) => `sql_module_${moduleOrder}`,
            sectionSlug: (moduleOrder: number, sectionOrder: number) =>
                `section_${moduleOrder}_${sectionOrder}`,
            modulePrefix: (moduleOrder: number) => `sql${moduleOrder}`,
            keyPatterns: {
                topicCardTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    cardId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.cards.${cardId}.title`,
                topicProjectStepTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    stepId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.project.${stepId}.title`,
                sketchTitleKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    sketchId: string,
                ) => `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}.title`,
                sketchBodyKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                    sketchId: string,
                ) => `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}.bodyMarkdown`,
                topicLabelKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.label`,
                topicSummaryKey: (
                    subjectSlug: string,
                    moduleSlug: string,
                    topicId: string,
                ) => `topics.${subjectSlug}.${moduleSlug}.${topicId}.summary`,
                exerciseMessageBase: (exerciseId: string) => `quiz.${exerciseId}`,
            },
        },
    } as any;
}

function makeSeed() {
    return {
        subjectSlug: "sql",
        topicId: "what-sql-means",
        moduleRuntimeDefaults: {
            kind: "sql",
            datasetId: "students_intro",
            fixedSqlDialect: "sqlite",
            resultShape: "table",
        },
    } as any;
}

function makeDraftWithExercise(exercise: any) {
    return {
        title: "What SQL Means",
        summary: "Intro topic",
        minutes: 15,
        sketchBlocks: [
            {
                id: "sketch-1",
                title: "Sketch 1",
                bodyMarkdown: "Body 1",
            },
        ],
        quizDraft: [exercise],
    } as any;
}

describe("buildTopicBundleFromDraft messageBase integration", () => {
    it("derives a fully qualified messageBase from exercise id when messageBase is missing", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: makeSeed(),
            moduleOrder: 0,
            sectionOrder: 1,
            draft: makeDraftWithExercise({
                id: "single-1",
                kind: "single_choice",
                title: "What is a table?",
                prompt: "Which choice best describes a table?",
                hint: "Think about stored data.",
                help: {
                    concept: "A table stores related data.",
                    hint_1: "Think about structure.",
                    hint_2: "Choose the storage structure.",
                },
                options: ["A", "B", "C", "D"],
                correctOptionIds: ["a"],
            }),
        });

        expect(bundle.exercises).toHaveLength(1);
        expect(bundle.exercises[0]?.messageBase).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.single-1",
        );
    });

    it("preserves a local messageBase override but compiles it to a fully qualified one", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: makeSeed(),
            moduleOrder: 0,
            sectionOrder: 1,
            draft: makeDraftWithExercise({
                id: "single-1",
                messageBase: "quiz.table-definition",
                kind: "single_choice",
                title: "What is a table?",
                prompt: "Which choice best describes a table?",
                hint: "Think about stored data.",
                help: {
                    concept: "A table stores related data.",
                    hint_1: "Think about structure.",
                    hint_2: "Choose the storage structure.",
                },
                options: ["A", "B", "C", "D"],
                correctOptionIds: ["a"],
            }),
        });

        expect(bundle.exercises[0]?.messageBase).toBe(
            "topics.sql.sql_module_0.what-sql-means.quiz.table-definition",
        );
    });

    it("throws if two exercises in the same topic reuse the same local messageBase", () => {
        const draft = {
            title: "What SQL Means",
            summary: "Intro topic",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "single-1",
                    messageBase: "quiz.same",
                    kind: "single_choice",
                    title: "Q1",
                    prompt: "Prompt 1",
                    hint: "Hint 1",
                    help: {
                        concept: "Concept 1",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                    options: ["A", "B"],
                    correctOptionIds: ["a"],
                },
                {
                    id: "multi-1",
                    messageBase: "quiz.same",
                    kind: "multi_choice",
                    title: "Q2",
                    prompt: "Prompt 2",
                    hint: "Hint 2",
                    help: {
                        concept: "Concept 2",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                    options: ["A", "B"],
                    correctOptionIds: ["a"],
                },
            ],
        } as any;

        expect(() =>
            buildTopicBundleFromDraft({
                shape: makeShapePack(),
                seed: makeSeed(),
                moduleOrder: 0,
                sectionOrder: 1,
                draft,
            }),
        ).toThrow(/Duplicate messageBase/i);
    });

    it("allows the same local messageBase in different topics because the compiled qualified keys differ", () => {
        const exercise = {
            id: "single-1",
            messageBase: "quiz.same",
            kind: "single_choice",
            title: "Q1",
            prompt: "Prompt 1",
            hint: "Hint 1",
            help: {
                concept: "Concept 1",
                hint_1: "Hint 1",
                hint_2: "Hint 2",
            },
            options: ["A", "B"],
            correctOptionIds: ["a"],
        };

        const first = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: {
                ...makeSeed(),
                topicId: "topic-a",
            },
            moduleOrder: 0,
            sectionOrder: 1,
            draft: makeDraftWithExercise(exercise),
        });

        const second = buildTopicBundleFromDraft({
            shape: makeShapePack(),
            seed: {
                ...makeSeed(),
                topicId: "topic-b",
            },
            moduleOrder: 0,
            sectionOrder: 1,
            draft: makeDraftWithExercise(exercise),
        });

        expect(first.exercises[0]?.messageBase).toBe(
            "topics.sql.sql_module_0.topic-a.quiz.same",
        );
        expect(second.exercises[0]?.messageBase).toBe(
            "topics.sql.sql_module_0.topic-b.quiz.same",
        );
        expect(first.exercises[0]?.messageBase).not.toBe(
            second.exercises[0]?.messageBase,
        );
    });
});