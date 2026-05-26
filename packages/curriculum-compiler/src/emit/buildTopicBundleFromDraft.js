import { assertProfileSupportsCodeInput, getCurriculumProfile, } from "@zoeskoul/curriculum-profiles";
import { buildExerciseMessageKeys } from "../messages/buildMessageKeys.js";
import { validateTopicMessageBases } from "../messages/validateTopicMessageBases.js";
import { resolveLogicalSectionSlug } from "./resolveLogicalSectionSlug.js";
function optionIdsFromCount(count) {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}
function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function uniqueNonEmpty(values) {
    return Array.from(new Set(values.map((x) => x.trim()).filter(Boolean)));
}
function codeInputIds(draft) {
    return draft.quizDraft
        .filter((exercise) => exercise.kind === "code_input")
        .map((exercise) => exercise.id);
}
function buildProjectStepIds(draft, maxSteps = 5) {
    const codeIds = codeInputIds(draft);
    const codeIdSet = new Set(codeIds);
    const explicitStepIds = (draft.projectDraft?.stepIds ?? []).filter((id) => codeIdSet.has(id));
    return uniqueNonEmpty([...explicitStepIds, ...codeIds]).slice(0, maxSteps);
}
function quizExercises(draft) {
    return draft.quizDraft.filter((exercise) => exercise.kind !== "code_input");
}
function projectStepIdFromExerciseId(id) {
    return id
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}
export function buildTopicBundleFromDraft(args) {
    const { shape, seed, draft } = args;
    const profile = getCurriculumProfile(seed.profileId);
    const codeInputProfile = draft.quizDraft.some((exercise) => exercise.kind === "code_input")
        ? assertProfileSupportsCodeInput(profile)
        : null;
    const kp = shape.subjectManifest.keyPatterns;
    const logicalModuleSlug = seed.moduleSlug;
    const logicalSectionSlug = resolveLogicalSectionSlug({
        subjectSlug: seed.subjectSlug,
        rawSectionSlug: seed.sectionSlug,
    });
    const prefix = seed.modulePrefix;
    const targets = seed.generationTargets;
    const projectStepIds = buildProjectStepIds(draft, targets?.projectCodeInputTarget ?? 3);
    const quizOnlyExercises = quizExercises(draft);
    const quizVisibleDefault = targets?.quizVisibleDefault ?? 4;
    const quizVisibleMax = targets?.quizVisibleMax ?? 6;
    const maxAttempts = targets?.maxAttempts ?? null;
    const sketchCards = draft.sketchBlocks.map((block, index) => ({
        id: `sketch${index}`,
        kind: "sketch",
        titleKey: kp.topicCardTitleKey(seed.subjectSlug, logicalModuleSlug, seed.topicId, `sketch${index}`),
        sketchId: block.id,
        height: 420,
    }));
    const quizCard = quizOnlyExercises.length > 0
        ? [
            {
                id: "quiz",
                kind: "quiz",
                titleKey: kp.topicCardTitleKey(seed.subjectSlug, logicalModuleSlug, seed.topicId, "quiz"),
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
    const projectCard = projectStepIds.length > 0
        ? [
            {
                id: "project",
                kind: "project",
                titleKey: kp.topicCardTitleKey(seed.subjectSlug, logicalModuleSlug, seed.topicId, "project"),
                project: {
                    difficulty: "easy",
                    allowReveal: true,
                    preferKind: "code_input",
                    maxAttempts,
                    steps: projectStepIds.map((exerciseId) => {
                        const stepId = projectStepIdFromExerciseId(exerciseId);
                        return {
                            id: stepId,
                            titleKey: kp.topicProjectStepTitleKey(seed.subjectSlug, logicalModuleSlug, seed.topicId, stepId),
                            exerciseKey: exerciseId,
                            difficulty: "easy",
                            preferKind: "code_input",
                            seedPolicy: "global",
                            maxAttempts,
                        };
                    }),
                },
            },
        ]
        : [];
    const sketches = draft.sketchBlocks.map((block) => ({
        id: block.id,
        archetype: "paragraph",
        titleKey: kp.sketchTitleKey(seed.subjectSlug, logicalModuleSlug, seed.topicId, block.id),
        bodyKey: kp.sketchBodyKey(seed.subjectSlug, logicalModuleSlug, seed.topicId, block.id),
    }));
    validateTopicMessageBases(draft.quizDraft.map((exercise) => ({
        id: exercise.id,
        messageBase: exercise.messageBase,
    })));
    const projectStepIdSet = new Set(projectStepIds);
    const exercises = draft.quizDraft.map((exercise) => {
        const optionIdsForKeys = exercise.kind === "single_choice" || exercise.kind === "multi_choice"
            ? optionIdsFromCount(exercise.options.length)
            : [];
        const messageKeys = buildExerciseMessageKeys({
            scope: {
                subjectSlug: seed.subjectSlug,
                moduleSlug: logicalModuleSlug,
                topicId: seed.topicId,
            },
            exerciseId: exercise.id,
            messageBase: exercise.messageBase,
            optionIds: optionIdsForKeys,
        });
        const messageBase = messageKeys.qualifiedBase;
        /**
         * Final rule:
         * - code_input is project.
         * - non-code is quiz.
         */
        const isProjectExercise = exercise.kind === "code_input" || projectStepIdSet.has(exercise.id);
        if (exercise.kind === "single_choice") {
            const optionIds = optionIdsFromCount(exercise.options.length);
            const correctOptionId = normalizeText(exercise.correctOptionIds[0]);
            if (!correctOptionId || !optionIds.includes(correctOptionId)) {
                throw new Error(`Invalid single_choice exercise "${exercise.id}": correct answer key must be included in available optionIds.\n\nExpected one of: ${JSON.stringify(optionIds)}\nReceived: ${JSON.stringify(exercise.correctOptionIds)}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`);
            }
            return {
                id: exercise.id,
                kind: "single_choice",
                purpose: "quiz",
                weight: 1,
                messageBase,
                optionIds,
                expected: {
                    kind: "single_choice",
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
                throw new Error(`Invalid multi_choice exercise "${exercise.id}": no correct answer key is included in available optionIds.\n\nExpected values from: ${JSON.stringify(optionIds)}\nReceived: ${JSON.stringify(exercise.correctOptionIds)}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`);
            }
            return {
                id: exercise.id,
                kind: "multi_choice",
                purpose: "quiz",
                weight: 1,
                messageBase,
                optionIds,
                expected: {
                    kind: "multi_choice",
                    optionIds: correctOptionIds,
                },
            };
        }
        if (exercise.kind === "drag_reorder") {
            const tokenIds = exercise.tokens.map((_, i) => `t${i + 1}`);
            const tokenMap = new Map();
            exercise.tokens.forEach((token, i) => {
                tokenMap.set(normalizeText(token), tokenIds[i]);
            });
            const expectedTokenIds = exercise.correctOrder.map((token) => tokenMap.get(normalizeText(token)) ?? "");
            if (expectedTokenIds.length !== exercise.tokens.length ||
                expectedTokenIds.some((id) => !id)) {
                throw new Error(`Invalid drag_reorder exercise "${exercise.id}": every correctOrder value must be included in tokens.\n\nTokens: ${JSON.stringify(exercise.tokens)}\nCorrect order: ${JSON.stringify(exercise.correctOrder)}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`);
            }
            return {
                id: exercise.id,
                kind: "drag_reorder",
                purpose: "quiz",
                weight: 1,
                messageBase,
                tokenIds,
                expected: {
                    kind: "drag_reorder",
                    tokenIds: expectedTokenIds,
                },
            };
        }
        if (exercise.kind === "fill_blank_choice") {
            const correctValue = normalizeText(exercise.correctValue);
            const normalizedChoices = exercise.choices.map(normalizeText);
            if (!correctValue ||
                !normalizedChoices.some((choice) => choice === correctValue)) {
                throw new Error(`Invalid fill_blank_choice exercise "${exercise.id}": correctValue must be included in choices.\n\nChoices: ${JSON.stringify(exercise.choices)}\nCorrect value: ${JSON.stringify(exercise.correctValue)}\n\nExercise:\n${JSON.stringify(exercise, null, 2)}`);
            }
            return {
                id: exercise.id,
                kind: "fill_blank_choice",
                purpose: "quiz",
                weight: 1,
                messageBase,
                choiceCount: exercise.choices.length,
                expected: {
                    kind: "fill_blank_choice",
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
        throw new Error(`Unsupported exercise kind: ${exercise.kind}`);
    });
    return {
        topicId: seed.topicId,
        subjectSlug: seed.subjectSlug,
        moduleSlug: logicalModuleSlug,
        sectionSlug: logicalSectionSlug,
        prefix,
        minutes: seed.minutes,
        runtimeDefaults: seed.moduleRuntimeDefaults ?? null,
        topic: {
            labelKey: kp.topicLabelKey(seed.subjectSlug, logicalModuleSlug, seed.topicId),
            summaryKey: kp.topicSummaryKey(seed.subjectSlug, logicalModuleSlug, seed.topicId),
        },
        cards: [...sketchCards, ...quizCard, ...projectCard],
        sketches,
        exercises,
    };
}
