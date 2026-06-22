import type {
    ExerciseKindKey,
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { RepairEntry, RepairReport } from "./profileServices.js";

export type DraftExercise = TopicAuthoringDraft["quizDraft"][number];
export type CodeInputDraft = Extract<DraftExercise, { kind: "code_input" }>;

const KIND_ORDER: ExerciseKindKey[] = [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
];

function safeSlug(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "topic";
}

function commonHelp(seed: TopicSeed) {
    const topicTitle = seed.title || seed.topicId || "this topic";
    return {
        concept: `This question checks the main idea from ${topicTitle}.`,
        hint_1: "Use the lesson explanation, then eliminate answers that do not match it.",
        hint_2: "Pick the answer that matches the course concept, not a random detail.",
    };
}

export function makePolicyRepair(args: {
    code: string;
    field: string;
    message: string;
    severity?: RepairEntry["severity"];
    category?: RepairEntry["category"];
}): RepairEntry {
    return {
        code: args.code,
        category: args.category ?? "other",
        severity: args.severity ?? "medium",
        field: args.field,
        message: args.message,
    };
}

function makeFallbackSingleChoice(seed: TopicSeed, index: number): DraftExercise {
    return {
        id: `${safeSlug(seed.topicId)}-single-choice-${index}`,
        kind: "single_choice",
        title: "Choose the best description",
        prompt: `Which statement best matches ${seed.title || "this topic"}?`,
        hint: "Look for the answer that describes the main concept from the lesson.",
        help: commonHelp(seed),
        options: [
            "It describes the main concept from the lesson.",
            "It is unrelated to the course topic.",
            "It skips the learner goal.",
            "It replaces the concept with an unsafe shortcut.",
        ],
        correctOptionIds: ["a"],
    };
}

function makeFallbackMultiChoice(seed: TopicSeed, index: number): DraftExercise {
    return {
        id: `${safeSlug(seed.topicId)}-multi-choice-${index}`,
        kind: "multi_choice",
        title: "Select safe learning habits",
        prompt: "Which actions are good habits while learning this topic?",
        hint: "Good habits keep the learner focused on the lesson goal and visible results.",
        help: commonHelp(seed),
        options: [
            "Read the prompt carefully before acting",
            "Check your result after making a change",
            "Ignore the exact names in the task",
            "Use unrelated shortcuts without understanding them",
        ],
        correctOptionIds: ["a", "b"],
    };
}

function makeFallbackDragReorder(seed: TopicSeed, index: number): DraftExercise {
    return {
        id: `${safeSlug(seed.topicId)}-drag-reorder-${index}`,
        kind: "drag_reorder",
        title: "Order a safe practice flow",
        prompt: "Put these learning steps in a safe order.",
        hint: "Understand first, try a small step, then check the result.",
        help: commonHelp(seed),
        tokens: ["Read the goal", "Try one step", "Check the result", "Reflect on what changed"],
        correctOrder: ["Read the goal", "Try one step", "Check the result", "Reflect on what changed"],
    };
}

function makeFallbackFillBlank(seed: TopicSeed, index: number): DraftExercise {
    return {
        id: `${safeSlug(seed.topicId)}-fill-blank-${index}`,
        kind: "fill_blank_choice",
        title: "Complete the main idea",
        prompt: "Complete the sentence about the lesson.",
        hint: "Choose the word that fits the main concept.",
        help: commonHelp(seed),
        template: "A good answer should match the lesson ____.",
        choices: ["goal", "mistake", "distraction", "shortcut"],
        correctValue: "goal",
    };
}

function makeGenericFallbackExercise(args: {
    seed: TopicSeed;
    kind: ExerciseKindKey;
    index: number;
}): DraftExercise | null {
    switch (args.kind) {
        case "single_choice":
            return makeFallbackSingleChoice(args.seed, args.index);
        case "multi_choice":
            return makeFallbackMultiChoice(args.seed, args.index);
        case "drag_reorder":
            return makeFallbackDragReorder(args.seed, args.index);
        case "fill_blank_choice":
            return makeFallbackFillBlank(args.seed, args.index);
        case "code_input":
            return null;
    }
}

export function repairDraftToPlannedExerciseCounts(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    repairCodePrefix?: string;
    normalizeCodeInput?: (exercise: CodeInputDraft) => CodeInputDraft;
    makeCodeInputFallback?: (seed: TopicSeed, index: number) => CodeInputDraft;
}): {
    draft: TopicAuthoringDraft;
    report: RepairReport;
} {
    const repairs: RepairEntry[] = [];
    const plannedCounts = args.seed.plannedExerciseCounts?.counts;
    const prefix = args.repairCodePrefix ?? "EXERCISE_POLICY";

    let quizDraft = args.draft.quizDraft.map((exercise) =>
        exercise.kind === "code_input" && args.normalizeCodeInput
            ? args.normalizeCodeInput(exercise)
            : exercise,
    );

    if (!plannedCounts) {
        return {
            draft: {
                ...args.draft,
                quizDraft,
            },
            report: {
                topicId: args.seed.topicId,
                repairs,
            },
        };
    }

    const balanced: DraftExercise[] = [];

    for (const kind of KIND_ORDER) {
        const expected = Math.max(0, Math.floor(plannedCounts[kind] ?? 0));
        const existing = quizDraft.filter((exercise) => exercise.kind === kind);

        balanced.push(...existing.slice(0, expected));

        if (existing.length > expected) {
            repairs.push(
                makePolicyRepair({
                    code: `${prefix}_KIND_OVER_TARGET_TRIMMED`,
                    field: "quizDraft",
                    severity: "medium",
                    message: `Trimmed ${existing.length - expected} extra ${kind} exercise(s) to match the shared planned exercise policy.`,
                }),
            );
        }

        for (let index = existing.length + 1; index <= expected; index += 1) {
            const fallback =
                kind === "code_input"
                    ? args.makeCodeInputFallback?.(args.seed, index)
                    : makeGenericFallbackExercise({
                          seed: args.seed,
                          kind,
                          index,
                      });

            if (!fallback) {
                repairs.push(
                    makePolicyRepair({
                        code: `${prefix}_CODE_INPUT_FALLBACK_NOT_AVAILABLE`,
                        field: "quizDraft",
                        severity: "high",
                        message: `Shared policy could not add missing code_input exercise ${index}; code_input recipe details must come from the specific course profile.`,
                    }),
                );
                continue;
            }

            balanced.push(fallback);
            repairs.push(
                makePolicyRepair({
                    code: `${prefix}_KIND_UNDER_TARGET_FILLED`,
                    field: "quizDraft",
                    severity: kind === "code_input" ? "high" : "medium",
                    message: `Added a fallback ${kind} exercise so the draft matches the shared planned exercise policy.`,
                }),
            );
        }
    }

    return {
        draft: {
            ...args.draft,
            quizDraft: balanced,
        },
        report: {
            topicId: args.seed.topicId,
            repairs,
        },
    };
}
