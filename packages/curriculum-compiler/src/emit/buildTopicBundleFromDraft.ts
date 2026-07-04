import type {
    ExerciseKind,
    ManifestCard,
    ManifestExercise,
    ManifestSketch,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    assertProfileSupportsCodeInput,
    getCurriculumProfile,
    type SubjectShapePack,
} from "@zoeskoul/curriculum-profiles";
import { buildExerciseMessageKeys } from "../messages/buildMessageKeys.js";
import { validateTopicMessageBases } from "../messages/validateTopicMessageBases.js";
import {
    buildExerciseLocalMessageBaseForEmission,
    effectiveSketchBlocks,
    projectStepIdFromExerciseId,
    resolveTopicProjectKind,
    tryItExerciseId,
    tryItMessageId,
} from "./exerciseMessageBase.js";
import { applyProgressiveProjectFlow } from "./progressiveProjectFlow.js";
import {
    resolveTryItExerciseIdForSketch,
    resolveTryItSketchIndexes,
} from "./projectTopicEmission.js";
import { resolveLogicalSectionSlug } from "./resolveLogicalSectionSlug.js";
type DraftExercise = TopicAuthoringDraft["quizDraft"][number];

function optionIdsFromCount(count: number) {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function uniqueNonEmpty(values: string[]) {
    return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}

function isGeneratedPolicyExerciseId(id: string) {
    return /^policy_[a-z_]+_\d+$/i.test(id.trim());
}

function buildProjectStepIds(
    draft: TopicAuthoringDraft,
    sourceExercises: DraftExercise[],
    maxSteps = 5,
) {
    const sourceIds = sourceExercises
        .map((exercise) => exercise.id)
        .filter((id) => !isGeneratedPolicyExerciseId(id));
    const sourceIdSet = new Set(sourceIds);

    const explicitStepIds = (draft.projectDraft?.stepIds ?? []).filter((id) =>
        sourceIdSet.has(id) && !isGeneratedPolicyExerciseId(id),
    );

    if (explicitStepIds.length > 0) {
        return uniqueNonEmpty(explicitStepIds).slice(0, maxSteps);
    }

    return uniqueNonEmpty(sourceIds).slice(0, maxSteps);
}

function quizExercises(draft: TopicAuthoringDraft) {
    return draft.quizDraft.filter((exercise) => exercise.kind !== "code_input");
}

function topicMessageRoot(subjectSlug: string, moduleSlug: string, topicId: string) {
    return `topics.${subjectSlug}.${moduleSlug}.${topicId}`;
}

function manifestPreferredKind(value: string | null | undefined): ExerciseKind | null {
    return value ? (value as ExerciseKind) : null;
}

export function buildTopicBundleFromDraft(args: {
    shape: SubjectShapePack;
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): TopicBundleManifest {
    const { shape, seed, draft } = args;
    const profile = getCurriculumProfile(seed.profileId);
    const codeInputProfile =
        draft.quizDraft.some((exercise) => exercise.kind === "code_input")
            ? assertProfileSupportsCodeInput(profile)
            : null;
    const kp = shape.subjectManifest.keyPatterns;
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
    const logicalSectionSlug = resolveLogicalSectionSlug({
        subjectSlug: seed.subjectSlug,
        rawSectionSlug: seed.sectionSlug,
    });
    const prefix = seed.modulePrefix;

    const targets = seed.generationTargets;
    const sourceProjectExercises = isProjectOnlyTopic && topicKind
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
            targets?.projectCodeInputTarget ?? 3,
        )
        : [];
    const tryItExercises = isProjectOnlyTopic
        ? []
        : draft.quizDraft.filter((exercise) => exercise.kind === "code_input");

    const quizOnlyExercises = isProjectOnlyTopic ? [] : quizExercises(draft);
    const sketchBlocks = effectiveSketchBlocks({ draft, topicKind });

    const quizVisibleDefault = targets?.quizVisibleDefault ?? 4;
    const quizVisibleMax = targets?.quizVisibleMax ?? 6;
    const maxAttempts = targets?.maxAttempts ?? null;
    const preferredTryItKind =
        projectConfig?.preferredProjectExerciseKind ??
        profile.practice?.preferredTryItExerciseKind ??
        null;
    const tryItSketchIndexes = new Set(
        isProjectOnlyTopic ? [] : resolveTryItSketchIndexes(
            { ...draft, sketchBlocks },
            seed,
            profile,
        ),
    );
    const tryItExerciseIdToMessageId = new Map<string, string>();
    const tryItSourceIdToCanonicalId = new Map<string, string>();
    const sketchCards: ManifestCard[] = sketchBlocks.map((block, index) => {
        const tryItEnabled = seed.practice?.tryIt === true && !isProjectOnlyTopic;
        const sourceTryItExerciseId =
            tryItEnabled && tryItSketchIndexes.has(index)
                ? resolveTryItExerciseIdForSketch({
                    draft,
                    exercises: tryItExercises,
                    preferredKind: preferredTryItKind,
                    profile,
                    seed,
                    sketchIndex: index,
                })
                : undefined;
        const canonicalTryItExerciseId = sourceTryItExerciseId
            ? tryItExerciseId(seed.topicId, index)
            : undefined;

        if (sourceTryItExerciseId && canonicalTryItExerciseId) {
            tryItSourceIdToCanonicalId.set(sourceTryItExerciseId, canonicalTryItExerciseId);
            const messageId = tryItMessageId(seed.topicId, index);
            tryItExerciseIdToMessageId.set(sourceTryItExerciseId, messageId);
            tryItExerciseIdToMessageId.set(canonicalTryItExerciseId, messageId);
        }

        return {
            id: `sketch${index}`,
            kind: "sketch" as const,
            titleKey: kp.topicCardTitleKey(
                seed.subjectSlug,
                logicalModuleSlug,
                seed.topicId,
                `sketch${index}`,
            ),
            sketchId: block.id,
            height: 420,
            ...(canonicalTryItExerciseId
                ? {
                    tryIt: {
                        id: canonicalTryItExerciseId,
                        titleKey: `${topicMessageRoot(
                            seed.subjectSlug,
                            logicalModuleSlug,
                            seed.topicId,
                        )}.tryIt.${tryItMessageId(seed.topicId, index)}.title`,
                        promptKey: `${topicMessageRoot(
                            seed.subjectSlug,
                            logicalModuleSlug,
                            seed.topicId,
                        )}.tryIt.${tryItMessageId(seed.topicId, index)}.prompt`,
                        exerciseKey: canonicalTryItExerciseId,
                        difficulty: "easy" as const,
                        preferKind: manifestPreferredKind(preferredTryItKind),
                        seedPolicy: "global" as const,
                        required: true,
                        allowReveal:
                            projectConfig?.tryItDefault?.allowReveal ??
                            projectConfig?.allowReveal ??
                            profile.practice?.tryItDefault.allowReveal ??
                            true,
                        maxAttempts,
                    },
                }
                : {}),
        };
    });

    const quizCard: ManifestCard[] =
        !isProjectOnlyTopic && quizOnlyExercises.length > 0
            ? [
                {
                    id: "quiz",
                    kind: "quiz" as const,
                    titleKey: kp.topicCardTitleKey(
                        seed.subjectSlug,
                        logicalModuleSlug,
                        seed.topicId,
                        "quiz",
                    ),
                    quiz: {
                        difficulty: "easy",
                        n: Math.min(quizVisibleDefault, quizOnlyExercises.length),
                        min: Math.min(quizVisibleDefault, quizOnlyExercises.length),
                        max: Math.min(quizVisibleMax, quizOnlyExercises.length),
                        selectionMode: "random",
                        allowReveal: true,
                        preferKind: null,
                        maxAttempts,
                    },
                },
            ]
            : [];

    const projectCard: ManifestCard[] =
        isProjectOnlyTopic && projectStepIds.length > 0
            ? [
                {
                    id: "project",
                    kind: "project" as const,
                    titleKey: kp.topicCardTitleKey(
                        seed.subjectSlug,
                        logicalModuleSlug,
                        seed.topicId,
                        "project",
                    ),
                    project: {
                        difficulty: "easy",
                        allowReveal: projectConfig?.allowReveal ?? true,
                        preferKind: manifestPreferredKind(
                            projectConfig?.preferredProjectExerciseKind ??
                            profile.practice?.preferredTryItExerciseKind ??
                            null,
                        ),
                        ...(topicKind === "capstone"
                            ? { displayKind: "capstone", uiKind: "capstone" }
                            : {}),
                        maxAttempts,
                        steps: projectStepIds.map((exerciseId) => {
                            const stepId = projectStepIdFromExerciseId(exerciseId);

                            return {
                                id: stepId,
                                titleKey: kp.topicProjectStepTitleKey(
                                    seed.subjectSlug,
                                    logicalModuleSlug,
                                    seed.topicId,
                                    stepId,
                                ),
                                exerciseKey: exerciseId,
                                difficulty: "easy",
                                preferKind: manifestPreferredKind(
                                    projectConfig?.preferredProjectExerciseKind ??
                                    profile.practice?.preferredTryItExerciseKind ??
                                    null,
                                ),
                                seedPolicy: "global",
                                maxAttempts,
                                ...(seed.practice?.projectFlow === "progressive" &&
                                    exerciseId !== projectStepIds[0]
                                    ? { carryFromPrev: true }
                                    : {}),
                            };
                        }),
                    },
                },
            ]
            : [];

    const sketches: ManifestSketch[] = sketchBlocks.map((block) => ({
        id: block.id,
        archetype: "paragraph" as const,
        titleKey: kp.sketchTitleKey(
            seed.subjectSlug,
            logicalModuleSlug,
            seed.topicId,
            block.id,
        ),
        bodyKey: kp.sketchBodyKey(
            seed.subjectSlug,
            logicalModuleSlug,
            seed.topicId,
            block.id,
        ),
    }));

    const projectStepIdSet = new Set(projectStepIds);

    const emittedDraftExercises = isProjectOnlyTopic
        ? draft.quizDraft.filter((exercise) => projectStepIdSet.has(exercise.id))
        : draft.quizDraft;

    validateTopicMessageBases(
        emittedDraftExercises.map((exercise) => ({
            id: exercise.id,
            messageBase: buildExerciseLocalMessageBaseForEmission({
                exercise,
                seed,
                topicKind,
                projectStepIdSet,
                tryItExerciseIdToMessageId,
            }),
        })),
    );
    const progressiveExercises = applyProgressiveProjectFlow({
        exercises: emittedDraftExercises,
        projectStepIds,
        projectConfig,
        seed,
    });

    const canonicalExercises = progressiveExercises.map((exercise) => {
        const canonicalId = tryItSourceIdToCanonicalId.get(exercise.id);
        return canonicalId ? { ...exercise, id: canonicalId } : exercise;
    });

    const exercises: ManifestExercise[] = canonicalExercises.map((exercise) => {
        const optionIdsForKeys =
            exercise.kind === "single_choice" || exercise.kind === "multi_choice"
                ? optionIdsFromCount(exercise.options.length)
                : [];

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
            optionIds: optionIdsForKeys,
        });

        const messageBase = messageKeys.qualifiedBase;

        const isProjectExercise = projectStepIdSet.has(exercise.id);

        if (exercise.kind === "single_choice") {
            const optionIds = optionIdsFromCount(exercise.options.length);
            const correctOptionId = normalizeText(exercise.correctOptionIds[0]);

            if (!correctOptionId || !optionIds.includes(correctOptionId)) {
                throw new Error(
                    `Invalid single_choice exercise "${exercise.id}": correct answer key must be included in available optionIds.\n\nExpected one of: ${JSON.stringify(
                        optionIds,
                    )}\nReceived: ${JSON.stringify(
                        exercise.correctOptionIds,
                    )}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`,
                );
            }

            return {
                id: exercise.id,
                kind: "single_choice" as const,
                purpose: isProjectExercise ? ("project" as const) : ("quiz" as const),
                weight: 1,
                messageBase,
                optionIds,
                expected: {
                    kind: "single_choice" as const,
                    optionId: correctOptionId,
                },
            };
        }

        if (exercise.kind === "multi_choice") {
            const optionIds = optionIdsFromCount(exercise.options.length);
            const correctOptionIds = exercise.correctOptionIds
                .map(normalizeText)
                .filter((id) => optionIds.includes(id));

            if (correctOptionIds.length === 0) {
                throw new Error(
                    `Invalid multi_choice exercise "${exercise.id}": no correct answer key is included in available optionIds.\n\nExpected values from: ${JSON.stringify(
                        optionIds,
                    )}\nReceived: ${JSON.stringify(
                        exercise.correctOptionIds,
                    )}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`,
                );
            }

            return {
                id: exercise.id,
                kind: "multi_choice" as const,
                purpose: isProjectExercise ? ("project" as const) : ("quiz" as const),
                weight: 1,
                messageBase,
                optionIds,
                expected: {
                    kind: "multi_choice" as const,
                    optionIds: correctOptionIds,
                },
            };
        }

        if (exercise.kind === "drag_reorder") {
            const tokenIds = exercise.tokens.map((_, i) => `t${i + 1}`);
            const tokenMap = new Map<string, string>();

            exercise.tokens.forEach((token, i) => {
                tokenMap.set(normalizeText(token), tokenIds[i]);
            });

            const expectedTokenIds = exercise.correctOrder.map(
                (token) => tokenMap.get(normalizeText(token)) ?? "",
            );

            if (
                expectedTokenIds.length !== exercise.tokens.length ||
                expectedTokenIds.some((id) => !id)
            ) {
                throw new Error(
                    `Invalid drag_reorder exercise "${exercise.id}": every correctOrder value must be included in tokens.\n\nTokens: ${JSON.stringify(
                        exercise.tokens,
                    )}\nCorrect order: ${JSON.stringify(
                        exercise.correctOrder,
                    )}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`,
                );
            }

            return {
                id: exercise.id,
                kind: "drag_reorder" as const,
                purpose: isProjectExercise ? ("project" as const) : ("quiz" as const),
                weight: 1,
                messageBase,
                tokenIds,
                expected: {
                    kind: "drag_reorder" as const,
                    tokenIds: expectedTokenIds,
                },
            };
        }

        if (exercise.kind === "fill_blank_choice") {
            const correctValue = normalizeText(exercise.correctValue);
            const normalizedChoices = exercise.choices.map(normalizeText);

            if (
                !correctValue ||
                !normalizedChoices.some((choice) => choice === correctValue)
            ) {
                throw new Error(
                    `Invalid fill_blank_choice exercise "${exercise.id}": correctValue must be included in choices.\n\nChoices: ${JSON.stringify(
                        exercise.choices,
                    )}\nCorrect value: ${JSON.stringify(
                        exercise.correctValue,
                    )}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`,
                );
            }

            return {
                id: exercise.id,
                kind: "fill_blank_choice" as const,
                purpose: isProjectExercise ? ("project" as const) : ("quiz" as const),
                weight: 1,
                messageBase,
                choiceCount: exercise.choices.length,
                expected: {
                    kind: "fill_blank_choice" as const,
                    value: correctValue,
                },
            };
        }

        if (exercise.kind === "code_input") {
            return (codeInputProfile ?? assertProfileSupportsCodeInput(profile)).buildManifest({
                exercise,
                seed,
                messageBase,
            });
        }

        throw new Error(
            `Unsupported exercise kind: ${(exercise as { kind: string }).kind}`,
        );
    });

    return {
        topicId: seed.topicId,
        subjectSlug: seed.subjectSlug,
        moduleSlug: logicalModuleSlug,
        sectionSlug: logicalSectionSlug,
        prefix,
        minutes: seed.minutes,
        runtimeDefaults: seed.moduleRuntimeDefaults ?? null,
        serviceDefaults: seed.moduleServiceDefaults ?? null,
        topic: {
            labelKey: kp.topicLabelKey(
                seed.subjectSlug,
                logicalModuleSlug,
                seed.topicId,
            ),
            summaryKey: kp.topicSummaryKey(
                seed.subjectSlug,
                logicalModuleSlug,
                seed.topicId,
            ),
        },
        cards: [...sketchCards, ...quizCard, ...projectCard],
        sketches,
        exercises,
    };
}
