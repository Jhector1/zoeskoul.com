import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";

function fail(message: string): never {
    throw new Error(`Invalid TopicAuthoringDraft: ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function canonicalOptionIds(count: number): string[] {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}

function assertHelp(
    help: unknown,
    label: string,
): asserts help is {
    concept: string;
    hint_1: string;
    hint_2: string;
} {
    if (!help || typeof help !== "object") {
        fail(`${label} needs help`);
    }

    const record = help as Record<string, unknown>;

    if (!isNonEmptyString(record.concept)) {
        fail(`${label} help.concept must be a non-empty string`);
    }

    if (!isNonEmptyString(record.hint_1)) {
        fail(`${label} help.hint_1 must be a non-empty string`);
    }

    if (!isNonEmptyString(record.hint_2)) {
        fail(`${label} help.hint_2 must be a non-empty string`);
    }
}

function countFillBlanks(template: string, prompt: string): number {
    const t = String(template ?? "");
    const p = String(prompt ?? "");

    const templateBracketBlanks = (t.match(/\[blank\d*\]/gi) ?? []).length;
    const templateUnderscoreBlanks = (t.match(/_{2,}/g) ?? []).length;
    const promptUnderscoreBlanks = (p.match(/_{2,}/g) ?? []).length;

    return templateBracketBlanks + templateUnderscoreBlanks + promptUnderscoreBlanks;
}

export function assertTopicAuthoringDraft(
    draft: TopicAuthoringDraft,
): asserts draft is TopicAuthoringDraft {
    if (!draft || typeof draft !== "object") {
        fail(`value is not an object`);
    }

    if (!isNonEmptyString(draft.title)) {
        fail(`title must be a non-empty string`);
    }

    if (!isNonEmptyString(draft.summary)) {
        fail(`summary must be a non-empty string`);
    }

    if (
        typeof draft.minutes !== "number" ||
        !Number.isFinite(draft.minutes) ||
        draft.minutes <= 0
    ) {
        fail(`minutes must be a positive number`);
    }

    if (!Array.isArray(draft.sketchBlocks)) {
        fail(`sketchBlocks must be an array`);
    }

    draft.sketchBlocks.forEach((block, i) => {
        if (!isNonEmptyString(block.id)) {
            fail(`sketchBlocks[${i}] needs id`);
        }
        if (!isNonEmptyString(block.title)) {
            fail(`sketchBlocks[${i}] needs title`);
        }
        if (!isNonEmptyString(block.bodyMarkdown)) {
            fail(`sketchBlocks[${i}] needs bodyMarkdown`);
        }
    });

    if (!Array.isArray(draft.quizDraft)) {
        fail(`quizDraft must be an array`);
    }

    draft.quizDraft.forEach((exercise, i) => {
        const label = `quizDraft[${i}]`;

        if (!isNonEmptyString(exercise.id)) {
            fail(`${label} needs id`);
        }
        if (!isNonEmptyString(exercise.title)) {
            fail(`${label} needs title`);
        }
        if (!isNonEmptyString(exercise.prompt)) {
            fail(`${label} needs prompt`);
        }
        if (!isNonEmptyString(exercise.hint)) {
            fail(`${label} needs hint`);
        }

        assertHelp(exercise.help, label);

        if (exercise.kind === "single_choice" || exercise.kind === "multi_choice") {
            if (!Array.isArray(exercise.options) || exercise.options.length < 2) {
                fail(`${label} ${exercise.kind} needs at least 2 options`);
            }

            if (exercise.options.some((opt) => !isNonEmptyString(opt))) {
                fail(`${label} ${exercise.kind} options must be non-empty strings`);
            }

            if (
                !Array.isArray(exercise.correctOptionIds) ||
                exercise.correctOptionIds.some((id) => !isNonEmptyString(id))
            ) {
                fail(`${label} ${exercise.kind} correctOptionIds must be non-empty strings`);
            }

            const allowedOptionIds = canonicalOptionIds(exercise.options.length);

            if (exercise.kind === "single_choice" && exercise.correctOptionIds.length !== 1) {
                fail(`${label} single_choice needs exactly 1 correctOptionIds entry`);
            }

            if (exercise.kind === "multi_choice" && exercise.correctOptionIds.length < 1) {
                fail(`${label} multi_choice needs at least 1 correctOptionIds entry`);
            }

            if (!exercise.correctOptionIds.every((id) => allowedOptionIds.includes(id))) {
                fail(
                    `${label} ${exercise.kind} correctOptionIds must be included in available options (${allowedOptionIds.join(", ")})`,
                );
            }

            return;
        }

        if (exercise.kind === "drag_reorder") {
            if (!Array.isArray(exercise.tokens) || exercise.tokens.length < 2) {
                fail(`${label} drag_reorder needs at least 2 tokens`);
            }

            if (exercise.tokens.some((token) => !isNonEmptyString(token))) {
                fail(`${label} drag_reorder tokens must be non-empty strings`);
            }

            if (
                !Array.isArray(exercise.correctOrder) ||
                exercise.correctOrder.length !== exercise.tokens.length
            ) {
                fail(`${label} drag_reorder correctOrder must have same length as tokens`);
            }

            if (exercise.correctOrder.some((token) => !isNonEmptyString(token))) {
                fail(`${label} drag_reorder correctOrder must be non-empty strings`);
            }

            const tokenSet = new Set(exercise.tokens.map((token) => token.trim()));

            if (!exercise.correctOrder.every((token) => tokenSet.has(token.trim()))) {
                fail(`${label} drag_reorder correctOrder must only contain values from tokens`);
            }

            return;
        }

        if (exercise.kind === "fill_blank_choice") {
            if (!isNonEmptyString(exercise.template)) {
                fail(`${label} fill_blank_choice needs template`);
            }

            const blankCount = countFillBlanks(exercise.template, exercise.prompt);

            if (blankCount === 0) {
                fail(`${label} fill_blank_choice needs exactly 1 blank placeholder`);
            }

            if (blankCount > 1) {
                fail(`${label} fill_blank_choice supports only 1 blank, but found ${blankCount}`);
            }

            if (!Array.isArray(exercise.choices) || exercise.choices.length < 2) {
                fail(`${label} fill_blank_choice needs at least 2 choices`);
            }

            if (exercise.choices.some((choice) => !isNonEmptyString(choice))) {
                fail(`${label} fill_blank_choice choices must be non-empty strings`);
            }

            if (!isNonEmptyString(exercise.correctValue)) {
                fail(`${label} fill_blank_choice needs correctValue`);
            }

            if (
                !exercise.choices.some(
                    (choice) => choice.trim() === exercise.correctValue.trim(),
                )
            ) {
                fail(`${label} fill_blank_choice correctValue must be included in choices`);
            }

            return;
        }

        if (exercise.kind === "code_input") {
            if (!isNonEmptyString(exercise.starterCode)) {
                fail(`${label} code_input needs starterCode`);
            }

            if (!isNonEmptyString(exercise.solutionCode)) {
                fail(`${label} code_input needs solutionCode`);
            }

            const recipeType = (exercise as { recipeType?: string }).recipeType;
            const tests = (exercise as { tests?: unknown[] }).tests;
            const semanticChecks = (exercise as { semanticChecks?: unknown[] }).semanticChecks;

            const hasTests = Array.isArray(tests) && tests.length > 0;
            const hasSemanticChecks =
                Array.isArray(semanticChecks) && semanticChecks.length > 0;

            if (recipeType === "semantic" && !hasSemanticChecks) {
                fail(`${label} semantic code_input needs semanticChecks`);
            }

            if (recipeType === "fixed_tests" && !hasTests) {
                fail(`${label} fixed_tests code_input needs tests`);
            }

            if (recipeType !== "sql_query" && !hasTests && !hasSemanticChecks) {
                fail(`${label} code_input needs either tests or semanticChecks`);
            }

            if (
                exercise.recipeType === "sql_query" &&
                typeof exercise.datasetId !== "undefined" &&
                !isNonEmptyString(exercise.datasetId)
            ) {
                fail(`${label} code_input datasetId must be non-empty when provided`);
            }

            // if (
            //     exercise.recipeType === "semantic" &&
            //     (!Array.isArray((exercise as { semanticChecks?: unknown[] }).semanticChecks) ||
            //         (exercise as { semanticChecks?: unknown[] }).semanticChecks!.length < 1)
            // ) {
            //     fail(`${label} semantic code_input needs semanticChecks`);
            // }

            return;
        }

        fail(`${label} has unknown kind`);
    });

    if (draft.projectDraft) {
        if (!isNonEmptyString(draft.projectDraft.title)) {
            fail(`projectDraft needs title`);
        }

        if (!Array.isArray(draft.projectDraft.stepIds)) {
            fail(`projectDraft.stepIds must be an array`);
        }

        if (draft.projectDraft.stepIds.some((id) => !isNonEmptyString(id))) {
            fail(`projectDraft.stepIds must be non-empty strings`);
        }
    }
}
