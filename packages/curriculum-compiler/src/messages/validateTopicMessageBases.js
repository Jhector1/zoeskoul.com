import { deriveExerciseLocalMessageBase } from "./buildMessageKeys.js";
export function validateTopicMessageBases(exercises) {
    const seenExerciseIds = new Set();
    const seenMessageBases = new Set();
    for (const exercise of exercises) {
        const exerciseId = String(exercise.id ?? "").trim();
        if (!exerciseId) {
            throw new Error("Exercise id cannot be empty");
        }
        if (seenExerciseIds.has(exerciseId)) {
            throw new Error(`Duplicate exercise id within topic: "${exerciseId}"`);
        }
        seenExerciseIds.add(exerciseId);
        const localMessageBase = deriveExerciseLocalMessageBase(exerciseId, exercise.messageBase);
        if (seenMessageBases.has(localMessageBase)) {
            throw new Error(`Duplicate messageBase within topic: "${localMessageBase}"`);
        }
        seenMessageBases.add(localMessageBase);
    }
}
