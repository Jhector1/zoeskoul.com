import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import { buildExerciseMessageKeys } from "../messages/buildMessageKeys.js";

function optionIdFromIndex(index: number) {
    return String.fromCharCode(97 + index);
}

function setNested(
    target: Record<string, unknown>,
    path: string[],
    value: unknown,
) {
    let cursor: Record<string, unknown> = target;

    for (let i = 0; i < path.length - 1; i += 1) {
        const key = path[i];
        const next = cursor[key];

        if (!next || typeof next !== "object" || Array.isArray(next)) {
            cursor[key] = {};
        }

        cursor = cursor[key] as Record<string, unknown>;
    }

    cursor[path[path.length - 1]] = value;
}

function splitQualifiedBase(messageBase: string): string[] {
    return String(messageBase ?? "")
        .split(".")
        .map((x) => x.trim())
        .filter(Boolean);
}

function uniqueNonEmpty(values: string[]) {
    return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function projectStepIdFromExerciseId(id: string) {
    return id
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function buildProjectStepIds(draft: TopicAuthoringDraft) {
    const codeInputIds = draft.quizDraft
        .filter((exercise) => exercise.kind === "code_input")
        .map((exercise) => exercise.id);

    const codeInputSet = new Set(codeInputIds);

    const explicit = (draft.projectDraft?.stepIds ?? []).filter((id) =>
        codeInputSet.has(id),
    );

    return uniqueNonEmpty([...explicit, ...codeInputIds]);
}

function hasQuizExercises(draft: TopicAuthoringDraft) {
    return draft.quizDraft.some((exercise) => exercise.kind !== "code_input");
}

export function buildMessagesFromDraft(args: {
    shape: SubjectShapePack;
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    moduleOrder: number;
}) {
    const { shape, seed, draft, moduleOrder } = args;

    const logicalModuleSlug = shape.subjectManifest.moduleSlug(moduleOrder);

    const out: Record<string, unknown> = {
        topics: {},
        sketches: {},
    };

    const topicPath = ["topics", seed.subjectSlug, logicalModuleSlug, seed.topicId];
    const sketchPath = ["sketches", seed.subjectSlug, logicalModuleSlug, seed.topicId];

    setNested(out, [...topicPath, "label"], draft.title);
    setNested(out, [...topicPath, "summary"], draft.summary);

    draft.sketchBlocks.forEach((block, index) => {
        setNested(out, [...topicPath, "cards", `sketch${index}`, "title"], block.title);
    });

    const projectStepIds = buildProjectStepIds(draft);

    if (hasQuizExercises(draft)) {
        setNested(out, [...topicPath, "cards", "quiz", "title"], "Quiz");
    }

    if (projectStepIds.length > 0) {
        setNested(
            out,
            [...topicPath, "cards", "project", "title"],
            draft.projectDraft?.title || "Practice",
        );

        for (const exerciseId of projectStepIds) {
            const stepId = projectStepIdFromExerciseId(exerciseId);
            const exercise = draft.quizDraft.find((q) => q.id === exerciseId);

            setNested(
                out,
                [...topicPath, "projectSteps", stepId, "title"],
                exercise?.title ?? stepId,
            );
        }
    }

    for (const block of draft.sketchBlocks) {
        setNested(out, [...sketchPath, block.id, "title"], block.title);
        setNested(out, [...sketchPath, block.id, "bodyMarkdown"], block.bodyMarkdown);
    }

    for (const exercise of draft.quizDraft) {
        const optionIds =
            exercise.kind === "single_choice" || exercise.kind === "multi_choice"
                ? exercise.options.map((_, index) => optionIdFromIndex(index))
                : [];

        const messageKeys = buildExerciseMessageKeys({
            scope: {
                subjectSlug: seed.subjectSlug,
                moduleSlug: logicalModuleSlug,
                topicId: seed.topicId,
            },
            exerciseId: exercise.id,
            messageBase: (exercise as { messageBase?: string }).messageBase,
            optionIds,
        });

        const quizBase = splitQualifiedBase(messageKeys.qualifiedBase);

        setNested(out, [...quizBase, "title"], exercise.title);
        setNested(out, [...quizBase, "prompt"], exercise.prompt);
        setNested(out, [...quizBase, "hint"], exercise.hint);
        setNested(out, [...quizBase, "help"], {
            concept: exercise.help.concept,
            hint_1: exercise.help.hint_1,
            hint_2: exercise.help.hint_2,
        });

        if (exercise.kind === "single_choice" || exercise.kind === "multi_choice") {
            const options: Record<string, string> = {};
            exercise.options.forEach((option, index) => {
                options[optionIdFromIndex(index)] = option;
            });
            setNested(out, [...quizBase, "options"], options);
            continue;
        }

        if (exercise.kind === "drag_reorder") {
            const tokens: Record<string, string> = {};
            exercise.tokens.forEach((token, index) => {
                tokens[`t${index + 1}`] = token;
            });
            setNested(out, [...quizBase, "tokens"], tokens);
            continue;
        }

        if (exercise.kind === "fill_blank_choice") {
            setNested(out, [...quizBase, "template"], exercise.template);
            setNested(out, [...quizBase, "choices"], exercise.choices);
            continue;
        }

        if (exercise.kind === "code_input") {
            setNested(out, [...quizBase, "starterCode"], exercise.starterCode);
        }
    }

    return out;
}