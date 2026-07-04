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

function normalizeKebabSegment(value: string) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function isReservedGeneratedMessageBase(value: string) {
    return (
        value.startsWith("tryIt.") ||
        value.startsWith("moduleProject.steps.") ||
        value.startsWith("finalCapstone.steps.")
    );
}

export function tryItMessageId(topicId: string, sketchIndex: number) {
    return `try_${normalizeSegment(topicId)}_sketch${sketchIndex}`;
}

export function tryItExerciseId(topicId: string, sketchIndex: number) {
    return `try-${normalizeKebabSegment(topicId)}-sketch${sketchIndex}`;
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

    // Older draft/test seeds can mark project behavior through projectFlow
    // before sectionRole/moduleRole is normalized. Treat those as module
    // projects so bundle message refs stay aligned with messages output.
    if (
        seed.practice?.projectFlow === "progressive" ||
        seed.practice?.projectFlow === "standalone"
    ) {
        return "module_project";
    }

    return null;
}

export function isProjectTopic(seed: TopicSeed) {
    return resolveTopicProjectKind(seed) !== null;
}

function isTryItPlaceholderSketch(block: TopicAuthoringDraft["sketchBlocks"][number]) {
    const id = normalizeKebabSegment(String(block.id ?? ""));
    const title = normalizeKebabSegment(String(block.title ?? ""));
    const body = String(block.bodyMarkdown ?? "").trim();

    // Models sometimes add an extra lesson sketch named "Try it yourself"
    // in addition to the real embedded Try It exercises. That block is not a
    // teaching sketch; keeping it makes all_sketches policy require one more
    // code_input than the emitter can map and can also render a duplicate
    // empty practice card.
    return (
        id === "try-it-yourself" ||
        title === "try-it-yourself" ||
        (title === "try-it" && body.length < 240)
    );
}

export function effectiveSketchBlocks(args: {
    draft: TopicAuthoringDraft;
    topicKind: TopicProjectKind;
}) {
    if (args.topicKind) return args.draft.sketchBlocks.slice(0, 1);
    return args.draft.sketchBlocks.filter((block) => !isTryItPlaceholderSketch(block));
}

export function buildExerciseLocalMessageBaseForEmission(args: {
    exercise: DraftExercise;
    seed: TopicSeed;
    topicKind: TopicProjectKind;
    projectStepIdSet: Set<string>;
    tryItExerciseIdToMessageId: Map<string, string>;
}) {
    const explicitProjectStepId = args.projectStepIdSet.has(args.exercise.id)
        ? projectStepIdFromExerciseId(args.exercise.id)
        : null;

    // Project-only topics should keep code_input learner text under the
    // project/capstone message namespace even when an older caller did not
    // precompute projectStepIdSet. That keeps topic.bundle.json refs aligned
    // with buildMessagesFromDraft output after the bundle was moved to @: keys.
    const fallbackProjectStepId = !explicitProjectStepId && args.topicKind && args.exercise.kind === "code_input"
        ? projectStepIdFromExerciseId(args.exercise.id)
        : null;

    const projectStepId = explicitProjectStepId ?? fallbackProjectStepId;

    if (projectStepId) {
        return args.topicKind === "capstone"
            ? `finalCapstone.steps.${projectStepId}`
            : `moduleProject.steps.${projectStepId}`;
    }

    const tryItId = args.tryItExerciseIdToMessageId.get(args.exercise.id);
    if (tryItId) {
        return `tryIt.${tryItId}`;
    }

    const authoredMessageBaseValue = (args.exercise as { messageBase?: unknown })
        .messageBase;
    const authoredMessageBase =
        typeof authoredMessageBaseValue === "string"
            ? authoredMessageBaseValue.trim()
            : "";

    // The generated namespaces below are assigned by the emitter after it
    // resolves which exercises are real sketch try-it cards or project steps.
    // Models sometimes echo a prior generated messageBase (for example
    // `tryIt.try_methods_and_responsibility_sketch0`) on an ordinary practice
    // exercise. Keeping that authored value can collide with the canonical
    // try-it card message base and fail emission with a duplicate messageBase.
    // If this exercise was truly selected for try-it/project use, the earlier
    // branches already returned the canonical generated base, so reserved
    // authored values here are stale and must fall back to practice scope.
    if (authoredMessageBase && !isReservedGeneratedMessageBase(authoredMessageBase)) {
        return authoredMessageBase;
    }

    return `practice.${args.exercise.id}`;
}
