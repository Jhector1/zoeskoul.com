import type {
    SqlTopicExerciseRecipe,
    SqlTopicRecipe,
} from "@zoeskoul/curriculum-contracts";
import { assertValidSqlTopicRecipe } from "../validateSqlTopicRecipe.js";

export function buildSqlTopicMessagesFromRecipe(args: {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
    recipe: SqlTopicRecipe;
    locale: string;
}): Record<string, unknown> {
    const { subjectSlug, moduleSlug, recipe } = args;

    assertValidSqlTopicRecipe(recipe, { failOnWarnings: false });

    const topicId = recipe.topicId;
    const topicCards: Record<string, { title: string }> = {};
    const sketchMap: Record<string, { title: string; bodyMarkdown: string }> = {};

    const sketchEntries = Object.entries(recipe.sketches);

    sketchEntries.forEach(([sketchId, sketch], index) => {
        topicCards[`sketch${index}`] = { title: sketch.cardTitle };
        sketchMap[sketchId] = {
            title: sketch.title,
            bodyMarkdown: sketch.bodyMarkdown,
        };
    });

    const exerciseMap = new Map<string, SqlTopicExerciseRecipe>();
    for (const exercise of recipe.exercises) {
        exerciseMap.set(exercise.id, exercise);
    }

    const practiceExercise = recipe.exercises.find((x) => x.kind === "code_input");
    const quizExercises = recipe.exercises.filter((x) => x.kind !== "code_input");

    if (practiceExercise) {
        topicCards.project = {
            title: practiceExercise.title,
        };
    }

    if (quizExercises.length) {
        topicCards.quiz = {
            title: `Quiz: ${recipe.title}`,
        };
    }

    const quizMap: Record<string, unknown> = {};

    for (const exercise of recipe.exercises) {
        const id = `${moduleSlug}_${topicId}_${exercise.id}`;

        if (exercise.kind === "code_input") {
            quizMap[id] = {
                title: exercise.title,
                prompt: exercise.prompt,
                help: {
                    concept: exercise.conceptText ?? recipe.summary,
                    hint_1:
                        exercise.hint1 ??
                        "Use the problem statement to choose the right SQL pattern.",
                    hint_2:
                        exercise.hint2 ??
                        "Write the query, run it, and verify the result carefully.",
                },
                hint: exercise.hint ?? "Write the query and check the output.",
                starterCode: exercise.starterCode,
            };
            continue;
        }

        if (exercise.kind === "single_choice") {
            quizMap[id] = {
                title: exercise.title,
                prompt: exercise.prompt,
                help: {
                    concept: exercise.conceptText ?? recipe.summary,
                    hint_1:
                        exercise.hint1 ??
                        "Look for the option that matches the main concept directly.",
                    hint_2:
                        exercise.hint2 ??
                        "Ignore answers that describe unrelated SQL behavior.",
                },
                hint: exercise.hint ?? "Match the answer to the topic summary.",
                options: exercise.options,
            };
            continue;
        }

        if (exercise.kind === "multi_choice") {
            quizMap[id] = {
                title: exercise.title,
                prompt: exercise.prompt,
                help: {
                    concept: exercise.conceptText ?? recipe.summary,
                    hint_1:
                        exercise.hint1 ??
                        "Pick statements that align with the topic summary and objectives.",
                    hint_2:
                        exercise.hint2 ??
                        "Reject statements that clearly describe unrelated SQL ideas.",
                },
                hint: exercise.hint ?? "Use the summary and objectives as your guide.",
                options: exercise.options,
            };
            continue;
        }

        if (exercise.kind === "drag_reorder") {
            quizMap[id] = {
                title: exercise.title,
                prompt: exercise.prompt,
                help: {
                    concept:
                        exercise.conceptText ??
                        "Order the steps in the most logical sequence.",
                    hint_1: exercise.hint1 ?? "Think about what should happen first.",
                    hint_2: exercise.hint2 ?? "Then think about what should happen last.",
                },
                hint: exercise.hint ?? "Order the steps logically.",
                tokens: exercise.tokens,
            };
            continue;
        }

        if (exercise.kind === "fill_blank_choice") {
            quizMap[id] = {
                title: exercise.title,
                prompt: exercise.prompt,
                help: {
                    concept: exercise.conceptText ?? recipe.summary,
                    hint_1:
                        exercise.hint1 ??
                        "Think about which SQL term best completes the sentence.",
                    hint_2:
                        exercise.hint2 ??
                        "Use the topic meaning to eliminate unrelated options.",
                },
                hint: exercise.hint ?? "Match the sentence to the right SQL term.",
                template: exercise.template,
                choices: exercise.choices,
                correct: exercise.correct,
            };
        }
    }

    return {
        topics: {
            [subjectSlug]: {
                [moduleSlug]: {
                    [topicId]: {
                        label: recipe.title,
                        summary: recipe.summary,
                        cards: topicCards,
                    },
                },
            },
        },
        sketches: {
            [subjectSlug]: {
                [moduleSlug]: {
                    [topicId]: sketchMap,
                },
            },
        },
        quiz: quizMap,
    };
}