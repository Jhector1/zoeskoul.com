import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    getCurriculumProfile,
    type SubjectShapePack,
} from "@zoeskoul/curriculum-profiles";
import { buildExerciseMessageKeys } from "../messages/buildMessageKeys.js";
import { applyProgressiveProjectFlow } from "./progressiveProjectFlow.js";
import {
    resolveTryItExerciseIdForSketch,
    resolveTryItSketchIndexes,
} from "./projectTopicEmission.js";

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

function buildProjectStepIds(
    draft: TopicAuthoringDraft,
    sourceExercises: TopicAuthoringDraft["quizDraft"],
    maxSteps = 5,
) {
    const sourceIds = sourceExercises.map((exercise) => exercise.id);
    const sourceIdSet = new Set(sourceIds);

    const explicit = (draft.projectDraft?.stepIds ?? []).filter((id) =>
        sourceIdSet.has(id),
    );

    return uniqueNonEmpty([...explicit, ...sourceIds]).slice(0, maxSteps);
}

function hasQuizExercises(draft: TopicAuthoringDraft) {
    return draft.quizDraft.some((exercise) => exercise.kind !== "code_input");
}

export function buildMessagesFromDraft(args: {
    shape: SubjectShapePack;
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}) {
    const { seed, draft } = args;
    const profile = getCurriculumProfile(seed.profileId);
    const topicKind =
        seed.moduleRole === "capstone" || seed.sectionRole === "capstone"
            ? "capstone"
            : seed.sectionRole === "module_project"
                ? "module_project"
                : null;
    const isProjectOnlyTopic = topicKind !== null && !!profile.project;
    const projectConfig =
        isProjectOnlyTopic && topicKind
            ? profile.project?.getProjectConfig({
                seed,
                topicKind,
            }) ?? null
            : null;

    const logicalModuleSlug = seed.moduleSlug;

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

    const sourceProjectExercises =
        isProjectOnlyTopic && topicKind
            ? draft.quizDraft.filter((exercise) =>
                profile.project?.isProjectExercise({
                    exercise,
                    seed,
                    topicKind,
                }) === true,
            )
            : draft.quizDraft.filter((exercise) => exercise.kind === "code_input");
    const projectStepIds = buildProjectStepIds(
        draft,
        sourceProjectExercises,
        seed.generationTargets?.projectCodeInputTarget ??
        projectConfig?.targetStepCount ??
        3,
    );


    const tryItExercises = sourceProjectExercises;
    const emittedDraftExercises = isProjectOnlyTopic
        ? draft.quizDraft.filter((exercise) => projectStepIds.includes(exercise.id))
        : draft.quizDraft;
    const progressiveExercises = applyProgressiveProjectFlow({
        exercises: emittedDraftExercises,
        projectStepIds,
        projectConfig,
        seed,
    });

    if (!isProjectOnlyTopic && hasQuizExercises(draft)) {
        setNested(out, [...topicPath, "cards", "quiz", "title"], "Quiz");
    }

    if (projectStepIds.length > 0) {
        const projectTitle =
            draft.projectDraft?.title ||
            projectConfig?.projectTitle ||
            "Practice";
        setNested(
            out,
            [...topicPath, "cards", "project", "title"],
            projectTitle,
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

    if (seed.practice?.tryIt === true) {
        const sketchIndexes = resolveTryItSketchIndexes(draft, seed, profile);
        const preferredTryItKind =
            projectConfig?.preferredProjectExerciseKind ??
            profile.practice?.preferredTryItExerciseKind ??
            null;
        for (const sketchIndex of sketchIndexes) {
            const exerciseId = resolveTryItExerciseIdForSketch({
                draft,
                exercises: tryItExercises,
                preferredKind: preferredTryItKind,
                profile,
                seed,
                sketchIndex,
            });
            const exercise = exerciseId
                ? draft.quizDraft.find((item) => item.id === exerciseId)
                : undefined;

            if (!exercise) continue;

            setNested(
                out,
                [...topicPath, "tryIt", "allowReveal"],
                projectConfig?.tryItDefault?.allowReveal ??
                    projectConfig?.allowReveal ??
                    profile.practice?.tryItDefault.allowReveal ??
                    true,
            );
            setNested(
                out,
                [
                    ...topicPath,
                    "tryIt",
                    `try_${seed.topicId.replace(/-/g, "_")}_sketch${sketchIndex}`,
                    "title",
                ],
                "Try it yourself",
            );
            setNested(
                out,
                [
                    ...topicPath,
                    "tryIt",
                    `try_${seed.topicId.replace(/-/g, "_")}_sketch${sketchIndex}`,
                    "prompt",
                ],
                exercise.prompt,
            );
        }
    }

    for (const block of draft.sketchBlocks) {
        setNested(out, [...sketchPath, block.id, "title"], block.title);
        setNested(out, [...sketchPath, block.id, "bodyMarkdown"], block.bodyMarkdown);
    }

    for (const exercise of progressiveExercises) {
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
