import type {
    SqlTopicExerciseRecipe,
    SqlTopicRecipe,
    TopicBundleManifest,
} from "@zoeskoul/curriculum-contracts";
import { assertValidSqlTopicRecipe } from "../validateSqlTopicRecipe.js";

function mapExerciseToManifestExercise(args: {
    moduleSlug: string;
    topicId: string;
    exercise: SqlTopicExerciseRecipe;
}): TopicBundleManifest["exercises"][number] {
    const { moduleSlug, topicId, exercise } = args;
    const manifestId = `${moduleSlug}_${topicId}_${exercise.id}`;
    const messageBase = `quiz.${manifestId}`;

    switch (exercise.kind) {
        case "code_input":
            return {
                id: manifestId,
                kind: "code_input",
                purpose: "project",
                weight: 1,
                messageBase,
                language: "sql",
                fixedSqlDialect: "sqlite",
                recipe: {
                    type: "sql_query",
                    datasetId: exercise.datasetId,
                    resultShape: "table",
                    solutionCode: exercise.solutionCode,
                },
            };

        case "single_choice":
            return {
                id: manifestId,
                kind: "single_choice",
                purpose: "quiz",
                weight: 1,
                messageBase,
                optionIds: ["a", "b", "c", "d"],
                expected: {
                    kind: "single_choice",
                    optionId: exercise.correct,
                },
            };

        case "multi_choice":
            return {
                id: manifestId,
                kind: "multi_choice",
                purpose: "quiz",
                weight: 1,
                messageBase,
                optionIds: ["a", "b", "c", "d", "e"],
                expected: {
                    kind: "multi_choice",
                    optionIds: exercise.correct,
                },
            };

        case "drag_reorder":
            return {
                id: manifestId,
                kind: "drag_reorder",
                purpose: "quiz",
                weight: 1,
                messageBase,
                tokenIds: ["t1", "t2", "t3"],
                expected: {
                    kind: "drag_reorder",
                    tokenIds: exercise.correct,
                },
            };

        case "fill_blank_choice":
            return {
                id: manifestId,
                kind: "fill_blank_choice",
                purpose: "quiz",
                weight: 1,
                messageBase,
                choiceCount: 4,
                expected: {
                    kind: "fill_blank_choice",
                    value: exercise.correct,
                },
            };
    }
}

export function buildSqlTopicBundleFromRecipe(args: {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
    recipe: SqlTopicRecipe;
}): TopicBundleManifest {
    const { subjectSlug, moduleSlug, sectionSlug, prefix, recipe } = args;

    assertValidSqlTopicRecipe(recipe, { failOnWarnings: false });

    const topicId = recipe.topicId;
    const topicBase = `topics.${subjectSlug}.${moduleSlug}.${topicId}`;
    const sketchEntries = Object.entries(recipe.sketches);

    const cards: TopicBundleManifest["cards"] = sketchEntries.map(
        ([, sketch], index) => ({
            id: `sketch${index}`,
            kind: "sketch",
            titleKey: `${topicBase}.cards.sketch${index}.title`,
            sketchId: Object.keys(recipe.sketches)[index]!,
            height: 520,
        }),
    );

    const manifestSketches: TopicBundleManifest["sketches"] = sketchEntries.map(
        ([sketchId]) => ({
            id: sketchId,
            archetype: "paragraph",
            titleKey: `${topicBase}.sketches.${sketchId}.title`,
            bodyKey: `${topicBase}.sketches.${sketchId}.body`,
        }),
    );

    const exercises = recipe.exercises.map((exercise) =>
        mapExerciseToManifestExercise({
            moduleSlug,
            topicId,
            exercise,
        }),
    );

    const practiceExercise = recipe.exercises.find((x) => x.kind === "code_input");
    const quizExercises = recipe.exercises.filter((x) => x.kind !== "code_input");

    if (practiceExercise) {
        cards.push({
            id: "project",
            kind: "project",
            titleKey: `${topicBase}.cards.project.title`,
            project: {
                difficulty: "easy",
                allowReveal: true,
                preferKind: "code_input",
                maxAttempts: 10,
                steps: [
                    {
                        id: practiceExercise.id,
                        titleKey: `${topicBase}.projectSteps.${practiceExercise.id}.title`,
                        exerciseKey: `${moduleSlug}_${topicId}_${practiceExercise.id}`,
                        difficulty: "easy",
                        preferKind: "code_input",
                        seedPolicy: "global",
                        maxAttempts: 10,
                    },
                ],
            },
        });
    }

    if (quizExercises.length > 0) {
        cards.push({
            id: "quiz",
            kind: "quiz",
            titleKey: `${topicBase}.cards.quiz.title`,
            quiz: {
                difficulty: "easy",
                n: quizExercises.length,
                allowReveal: true,
                preferKind: null,
                maxAttempts: 10,
            },
        });
    }

    const firstPractice = recipe.exercises.find((x) => x.kind === "code_input");

    return {
        topicId,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        prefix,
        minutes: recipe.minutes,
        topic: {
            labelKey: `${topicBase}.label`,
            summaryKey: `${topicBase}.summary`,
        },
        cards,
        sketches: manifestSketches,
        exercises,
        runtimeDefaults:
            firstPractice && firstPractice.kind === "code_input"
                ? {
                    kind: "sql",
                    datasetId: firstPractice.datasetId,
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                }
                : {
                    kind: "sql",
                    datasetId: "products_catalog",
                    fixedSqlDialect: "sqlite",
                    resultShape: "table",
                },
    };
}