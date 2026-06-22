import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";

export type TopicProjectKind = "module_project" | "capstone" | null;

type DraftExercise = TopicAuthoringDraft["quizDraft"][number];

function normalizeSegment(value: string) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function tryItMessageId(topicId: string, sketchIndex: number) {
    return `try_${normalizeSegment(topicId)}_sketch${sketchIndex}`;
}

export function projectStepIdFromExerciseId(id: string) {
    return normalizeSegment(id);
}

export function resolveTopicProjectKind(seed: TopicSeed): TopicProjectKind {
    if (seed.moduleRole === "capstone" || seed.sectionRole === "capstone") {
        return "capstone";
    }

    if (seed.sectionRole === "module_project") {
        return "module_project";
    }

    return null;
}

export function isProjectTopic(seed: TopicSeed) {
    return resolveTopicProjectKind(seed) !== null;
}

export function effectiveSketchBlocks(args: {
    draft: TopicAuthoringDraft;
    topicKind: TopicProjectKind;
}) {
    return args.topicKind ? args.draft.sketchBlocks.slice(0, 1) : args.draft.sketchBlocks;
}

export function buildExerciseLocalMessageBaseForEmission(args: {
    exercise: DraftExercise;
    seed: TopicSeed;
    topicKind: TopicProjectKind;
    projectStepIdSet: Set<string>;
    tryItExerciseIdToMessageId: Map<string, string>;
}) {
    const projectStepId = args.projectStepIdSet.has(args.exercise.id)
        ? projectStepIdFromExerciseId(args.exercise.id)
        : null;

    if (projectStepId) {
        return args.topicKind === "capstone"
            ? `finalCapstone.steps.${projectStepId}`
            : `moduleProject.steps.${projectStepId}`;
    }

    const tryItId = args.tryItExerciseIdToMessageId.get(args.exercise.id);
    if (tryItId) {
        return `tryIt.exercises.${args.exercise.id}`;
    }

    return `practice.${args.exercise.id}`;
}
