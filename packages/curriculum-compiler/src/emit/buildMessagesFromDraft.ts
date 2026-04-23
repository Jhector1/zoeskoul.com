import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";

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
        quiz: {},
    };

    const topicPath = ["topics", seed.subjectSlug, logicalModuleSlug, seed.topicId];
    const sketchPath = ["sketches", seed.subjectSlug, logicalModuleSlug, seed.topicId];

    setNested(out, [...topicPath, "label"], draft.title);
    setNested(out, [...topicPath, "summary"], draft.summary);

    draft.sketchBlocks.forEach((block, index) => {
        setNested(out, [...topicPath, "cards", `sketch${index}`, "title"], block.title);
    });

    if (draft.projectDraft) {
        setNested(out, [...topicPath, "cards", "project", "title"], draft.projectDraft.title);

        for (const stepId of draft.projectDraft.stepIds) {
            const exercise = draft.quizDraft.find((q) => q.id === stepId);
            setNested(
                out,
                [...topicPath, "projectSteps", stepId, "title"],
                exercise?.title ?? stepId,
            );
        }
    }

    setNested(out, [...topicPath, "cards", "quiz", "title"], "Quiz");

    for (const block of draft.sketchBlocks) {
        setNested(out, [...sketchPath, block.id, "title"], block.title);
        setNested(out, [...sketchPath, block.id, "bodyMarkdown"], block.bodyMarkdown);
    }

    for (const exercise of draft.quizDraft) {
        const quizBase = ["quiz", exercise.id];

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