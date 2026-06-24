import type {
    ExerciseKind,
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { CourseProfile } from "@zoeskoul/curriculum-profiles";

type DraftExercise = TopicAuthoringDraft["quizDraft"][number];

function pickExerciseIdByIndex(
    exercises: DraftExercise[],
    sketchIndex: number,
) {
    if (sketchIndex < 0 || sketchIndex >= exercises.length) return undefined;
    return exercises[sketchIndex]?.id;
}

function profilePlacement(profile: CourseProfile) {
    return (profile.practice?.tryItDefault as { placement?: "first_sketch" | "all_sketches" | "none" } | undefined)
        ?.placement;
}

function profileSketchIndex(profile: CourseProfile) {
    return profile.practice?.tryItDefault.sketchIndex;
}

export function resolveTryItPlacement(seed: TopicSeed, profile: CourseProfile) {
    return (
        seed.practice?.tryItPlacement ??
        profilePlacement(profile) ??
        "all_sketches"
    );
}

export function resolveTryItSketchIndexes(
    draft: TopicAuthoringDraft,
    seed: TopicSeed,
    profile: CourseProfile,
) {
    if (seed.practice?.tryIt !== true) return [] as number[];

    const placement = resolveTryItPlacement(seed, profile);
    if (placement === "none") return [] as number[];
    if (placement === "all_sketches") {
        return Array.from({ length: draft.sketchBlocks.length }, (_, index) => index);
    }

    return [seed.practice?.tryItSketchIndex ?? profileSketchIndex(profile) ?? 0];
}

export function resolveTryItExerciseIdForSketch(args: {
    draft: TopicAuthoringDraft;
    exercises: DraftExercise[];
    preferredKind?: ExerciseKind | null;
    profile: CourseProfile;
    seed: TopicSeed;
    sketchIndex: number;
}) {
    const { draft, exercises, preferredKind, seed, sketchIndex } = args;
    const allExercises = draft.quizDraft;
    const allIds = new Set(allExercises.map((exercise) => exercise.id));

    const explicitIds = seed.practice?.tryItExerciseIds;
    if (Array.isArray(explicitIds) && explicitIds.length > 0) {
        const explicitId = explicitIds[sketchIndex]?.trim();
        if (explicitId && allIds.has(explicitId)) {
            return explicitId;
        }
    }

    const explicitId = seed.practice?.tryItExerciseId?.trim();
    if (explicitId && allIds.has(explicitId) && sketchIndex === 0) {
        return explicitId;
    }

    const exerciseId = pickExerciseIdByIndex(exercises, sketchIndex);
    if (exerciseId) return exerciseId;

    if (preferredKind) {
        const preferredExercises = allExercises.filter((exercise) => exercise.kind === preferredKind);
        const preferredId = pickExerciseIdByIndex(preferredExercises, sketchIndex);
        if (preferredId) return preferredId;
    }

    const codeInputExercises = allExercises.filter((exercise) => exercise.kind === "code_input");
    return pickExerciseIdByIndex(codeInputExercises, sketchIndex);
}
