import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { repairExercise } from "@zoeskoul/curriculum-ai";
import { normalizeTopicAuthoringDraft } from "./normalizeTopicAuthoringDraft.js";

function hasBadOptions(exercise: TopicAuthoringDraft["quizDraft"][number]) {
    if (exercise.kind !== "single_choice" && exercise.kind !== "multi_choice") {
        return false;
    }

    return (
        exercise.options.length < 2 ||
        exercise.options.some((opt) => typeof opt !== "string" || !opt.trim())
    );
}

function needsRepair(exercise: TopicAuthoringDraft["quizDraft"][number]) {
    if (
        exercise.kind === "single_choice" &&
        (hasBadOptions(exercise) || exercise.correctOptionIds.length !== 1)
    ) {
        return true;
    }

    if (
        exercise.kind === "multi_choice" &&
        (hasBadOptions(exercise) || exercise.correctOptionIds.length === 0)
    ) {
        return true;
    }

    if (
        exercise.kind === "fill_blank_choice" &&
        (!exercise.template.trim() ||
            exercise.choices.length === 0 ||
            !exercise.correctValue.trim())
    ) {
        return true;
    }

    if (
        exercise.kind === "code_input" &&
        (!exercise.starterCode.trim() || !exercise.solutionCode.trim())
    ) {
        return true;
    }

    return false;
}

function isClearlyBrokenExercise(value: TopicAuthoringDraft["quizDraft"][number]) {
    return (
        !value.id.trim() ||
        !value.title.trim() ||
        !value.prompt.trim() ||
        ((value.kind === "single_choice" || value.kind === "multi_choice") &&
            value.options.length === 0)
    );
}

export async function repairIncompleteExercises(args: {
    provider: AiProvider;
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}) {
    const repairedQuizDraft: TopicAuthoringDraft["quizDraft"] = [];

    for (const exercise of args.draft.quizDraft) {
        if (!needsRepair(exercise)) {
            repairedQuizDraft.push(exercise);
            continue;
        }

        const repairedRaw = await repairExercise(args.provider, {
            seed: args.seed,
            exercise: exercise as unknown as Record<string, unknown>,
        });

        const normalizedSingle = normalizeTopicAuthoringDraft({
            title: args.draft.title,
            summary: args.draft.summary,
            minutes: args.draft.minutes,
            sketchBlocks: [],
            quizDraft: [repairedRaw],
            projectDraft: undefined,
        });

        const repairedExercise = normalizedSingle.quizDraft[0];

        if (!repairedExercise || isClearlyBrokenExercise(repairedExercise)) {
            console.error(
                "BAD_REPAIRED_EXERCISE",
                JSON.stringify(
                    {
                        original: exercise,
                        repairedRaw,
                        repairedExercise,
                    },
                    null,
                    2,
                ),
            );

            repairedQuizDraft.push(exercise);
            continue;
        }

        repairedQuizDraft.push(repairedExercise);
    }

    return {
        ...args.draft,
        quizDraft: repairedQuizDraft,
    };
}