import { deriveExerciseLocalMessageBase } from "./buildMessageKeys.js";

type TopicExerciseLike = {
    id: string;
    messageBase?: string;
};

export function validateTopicMessageBases(exercises: TopicExerciseLike[]) {
    const seenExerciseIds = new Set<string>();
    const seenMessageBases = new Set<string>();

    for (const exercise of exercises) {
        const exerciseId = String(exercise.id ?? "").trim();
        if (!exerciseId) {
            throw new Error("Exercise id cannot be empty");
        }

        if (seenExerciseIds.has(exerciseId)) {
            throw new Error(`Duplicate exercise id within topic: "${exerciseId}"`);
        }
        seenExerciseIds.add(exerciseId);

        const localMessageBase = deriveExerciseLocalMessageBase(
            exerciseId,
            exercise.messageBase,
        );

        if (seenMessageBases.has(localMessageBase)) {
            throw new Error(
                `Duplicate messageBase within topic: "${localMessageBase}"`,
            );
        }
        seenMessageBases.add(localMessageBase);
    }
}