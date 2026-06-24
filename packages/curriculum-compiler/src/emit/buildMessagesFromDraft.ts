import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    getCurriculumProfile,
    starterFileContentMessageField,
    type SubjectShapePack,
} from "@zoeskoul/curriculum-profiles";
import { buildExerciseMessageKeys } from "../messages/buildMessageKeys.js";
import {
    buildExerciseLocalMessageBaseForEmission,
    effectiveSketchBlocks,
    projectStepIdFromExerciseId,
    resolveTopicProjectKind,
    tryItMessageId,
} from "./exerciseMessageBase.js";
import { applyProgressiveProjectFlow } from "./progressiveProjectFlow.js";
import {
    resolveTryItExerciseIdForSketch,
    resolveTryItSketchIndexes,
} from "./projectTopicEmission.js";
import { buildTryItPrompt, buildTryItTitle } from "./tryItText.js";

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

function splitMessageField(field: string): string[] {
    return String(field ?? "")
        .split(".")
        .map((x) => x.trim())
        .filter(Boolean);
}

function uniqueNonEmpty(values: string[]) {
    return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}


function writeTerminalExpectationMessageEntries(args: {
    out: Record<string, unknown>;
    basePath: string[];
    terminalExpectations: unknown;
}) {
    const terminalExpectations = args.terminalExpectations;
    if (!terminalExpectations || typeof terminalExpectations !== "object" || Array.isArray(terminalExpectations)) {
        return;
    }

    const record = terminalExpectations as Record<string, unknown>;

    const writeCommandMessages = (kind: "requiredCommands" | "forbiddenCommands") => {
        const entries = record[kind];
        if (!Array.isArray(entries)) return;

        entries.forEach((entry, index) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
            const message = (entry as Record<string, unknown>).message;
            if (typeof message !== "string" || message.trim().length === 0 || message.startsWith("@:")) {
                return;
            }

            setNested(
                args.out,
                [
                    ...args.basePath,
                    "terminalExpectations",
                    kind,
                    String(index),
                    "message",
                ],
                message,
            );
        });
    };

    writeCommandMessages("requiredCommands");
    writeCommandMessages("forbiddenCommands");
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
    const topicKind = resolveTopicProjectKind(seed);
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

    const sketchBlocks = effectiveSketchBlocks({ draft, topicKind });

    sketchBlocks.forEach((block, index) => {
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
            : [];
    const projectStepIds = isProjectOnlyTopic
        ? buildProjectStepIds(
            draft,
            sourceProjectExercises,
            seed.generationTargets?.projectCodeInputTarget ??
            projectConfig?.targetStepCount ??
            3,
        )
        : [];


    const tryItExercises = isProjectOnlyTopic
        ? []
        : draft.quizDraft.filter((exercise) => exercise.kind === "code_input");
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
        setNested(out, [...topicPath, "cards", "quiz", "title"], "Practice");
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

    const tryItExerciseIdToMessageId = new Map<string, string>();

    if (seed.practice?.tryIt === true && !isProjectOnlyTopic) {
        const sketchIndexes = resolveTryItSketchIndexes(
            { ...draft, sketchBlocks },
            seed,
            profile,
        );
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

            const tryItId = tryItMessageId(seed.topicId, sketchIndex);
            tryItExerciseIdToMessageId.set(exercise.id, tryItId);

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
                    tryItId,
                    "title",
                ],
                buildTryItTitle(exercise.title),
            );
            setNested(
                out,
                [
                    ...topicPath,
                    "tryIt",
                    tryItId,
                    "prompt",
                ],
                buildTryItPrompt({
                    exerciseTitle: exercise.title,
                    exercisePrompt: exercise.prompt,
                    topicTitle: draft.title,
                    seed,
                    sketchTitle: sketchBlocks[sketchIndex]?.title,
                }),
            );
        }
    }

    for (const block of sketchBlocks) {
        setNested(out, [...sketchPath, block.id, "title"], block.title);
        setNested(out, [...sketchPath, block.id, "bodyMarkdown"], block.bodyMarkdown);
    }

    for (const exercise of progressiveExercises) {
        const optionIds =
            exercise.kind === "single_choice" || exercise.kind === "multi_choice"
                ? exercise.options.map((_, index) => optionIdFromIndex(index))
                : [];

        const projectStepIdSet = new Set(projectStepIds);
        const localMessageBase = buildExerciseLocalMessageBaseForEmission({
            exercise,
            seed,
            topicKind,
            projectStepIdSet,
            tryItExerciseIdToMessageId,
        });
        const messageKeys = buildExerciseMessageKeys({
            scope: {
                subjectSlug: seed.subjectSlug,
                moduleSlug: logicalModuleSlug,
                topicId: seed.topicId,
            },
            exerciseId: exercise.id,
            messageBase: localMessageBase,
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
            if (
                typeof exercise.instructions === "string" &&
                exercise.instructions.trim().length > 0
            ) {
                setNested(out, [...quizBase, "instructions"], exercise.instructions);
            }

            if (Array.isArray(exercise.starterFiles)) {
                exercise.starterFiles.forEach((file, index) => {
                    if (
                        typeof file?.content !== "string" ||
                        file.content.trim().length === 0
                    ) {
                        return;
                    }

                    const fieldPath = splitMessageField(
                        starterFileContentMessageField(file.path, index),
                    );
                    setNested(out, [...quizBase, ...fieldPath], file.content);
                });
            }

            writeTerminalExpectationMessageEntries({
                out,
                basePath: quizBase,
                terminalExpectations: (exercise as { terminalExpectations?: unknown })
                    .terminalExpectations,
            });
        }
    }

    return out;
}
