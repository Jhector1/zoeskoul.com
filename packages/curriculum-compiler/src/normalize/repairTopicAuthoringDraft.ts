import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeHintText(text: string, bannedValues: string[]): string {
    let out = normalizeText(text);

    for (const raw of bannedValues) {
        const banned = normalizeText(raw);
        if (!banned) continue;

        const pattern = new RegExp(`\\b${escapeRegExp(banned)}\\b`, "gi");
        out = out.replace(pattern, "the correct answer");
    }

    return out;
}

function uniqueNonEmpty(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const value of values.map(normalizeText)) {
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }

    return out;
}

function canonicalOptionIds(count: number): string[] {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}

function normalizeComparable(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[`"'.,;:!?()[\]{}]/g, "")
        .replace(/\s+/g, " ");
}

function containsOptionText(text: string, options: string[]): boolean {
    const normalizedText = normalizeComparable(text);
    if (!normalizedText) return false;

    return options.some((option) => {
        const normalizedOption = normalizeComparable(option);
        if (!normalizedOption) return false;
        return normalizedText.includes(normalizedOption);
    });
}

function makeSafeChoiceHelp(prompt: string) {
    const normalizedPrompt = normalizeText(prompt);

    return {
        hint: "Focus on the main concept being tested and eliminate choices that describe something different.",
        help: {
            concept:
                "Choose the option that matches the core idea described in the question without relying on repeated wording from the answer choices.",
            hint_1:
                "Rule out options that describe a different role, behavior, or SQL concept than the prompt asks about.",
            hint_2:
                normalizedPrompt
                    ? `Use the prompt carefully and pick the choice that best matches what it is asking about: ${normalizedPrompt.slice(0, 120)}${normalizedPrompt.length > 120 ? "..." : ""}`
                    : "Use the prompt carefully and pick the choice that best matches the concept being tested.",
        },
    };
}

function inferFillBlankCorrectValue(args: {
    choices: string[];
    correctValue?: string;
    prompt?: string;
    template?: string;
    hint?: string;
    helpConcept?: string;
    helpHint1?: string;
    helpHint2?: string;
}): string {
    const explicit = normalizeText(args.correctValue);
    if (explicit) return explicit;

    const choices = uniqueNonEmpty(args.choices);
    if (choices.length === 1) {
        return choices[0];
    }

    const searchSpace = [
        normalizeText(args.prompt),
        normalizeText(args.template),
        normalizeText(args.hint),
        normalizeText(args.helpConcept),
        normalizeText(args.helpHint1),
        normalizeText(args.helpHint2),
    ].join(" ");

    for (const choice of choices) {
        if (!choice) continue;
        const pattern = new RegExp(`\\b${escapeRegExp(choice)}\\b`, "i");
        if (pattern.test(searchSpace)) {
            return choice;
        }
    }

    return "";
}

function inferChoiceIds(args: {
    options: string[];
    rawCorrectOptionIds?: string[];
    prompt?: string;
    hint?: string;
    helpConcept?: string;
    helpHint1?: string;
    helpHint2?: string;
}): string[] {
    const options = uniqueNonEmpty(args.options);
    const optionIds = canonicalOptionIds(options.length);
    const optionById = new Map<string, string>();
    const idByNormalizedOptionText = new Map<string, string>();

    options.forEach((option, index) => {
        const id = optionIds[index];
        optionById.set(id, option);

        const normalized = normalizeComparable(option);
        if (!idByNormalizedOptionText.has(normalized)) {
            idByNormalizedOptionText.set(normalized, id);
        }
    });

    const rawIds = uniqueNonEmpty(args.rawCorrectOptionIds ?? []);
    const recovered: string[] = [];
    const used = new Set<string>();

    for (const raw of rawIds) {
        if (optionById.has(raw) && !used.has(raw)) {
            recovered.push(raw);
            used.add(raw);
            continue;
        }

        const byText = idByNormalizedOptionText.get(normalizeComparable(raw));
        if (byText && !used.has(byText)) {
            recovered.push(byText);
            used.add(byText);
        }
    }

    if (recovered.length > 0) {
        return recovered;
    }

    const searchSpace = [
        normalizeText(args.prompt),
        normalizeText(args.hint),
        normalizeText(args.helpConcept),
        normalizeText(args.helpHint1),
        normalizeText(args.helpHint2),
    ].join(" ");

    for (let index = 0; index < options.length; index += 1) {
        const optionText = options[index];
        const optionId = optionIds[index];
        const pattern = new RegExp(`\\b${escapeRegExp(optionText)}\\b`, "i");

        if (pattern.test(searchSpace) && !used.has(optionId)) {
            recovered.push(optionId);
            used.add(optionId);
        }
    }

    return recovered;
}

function repairDragReorderCorrectOrder(tokens: string[], correctOrder: string[]): string[] {
    const cleanTokens = uniqueNonEmpty(tokens);
    const cleanCorrectOrder = uniqueNonEmpty(correctOrder);

    if (cleanTokens.length === 0) return [];

    const exactTokenSet = new Set(cleanTokens);

    if (
        cleanCorrectOrder.length === cleanTokens.length &&
        cleanCorrectOrder.every((value) => exactTokenSet.has(value))
    ) {
        return cleanCorrectOrder;
    }

    const tokenByNormalized = new Map<string, string>();
    for (const token of cleanTokens) {
        const normalized = normalizeComparable(token);
        if (!tokenByNormalized.has(normalized)) {
            tokenByNormalized.set(normalized, token);
        }
    }

    const mapped: string[] = [];
    const used = new Set<string>();

    for (const raw of cleanCorrectOrder) {
        const exact = cleanTokens.find((token) => token === raw);
        if (exact && !used.has(exact)) {
            mapped.push(exact);
            used.add(exact);
            continue;
        }

        const normalizedMatch = tokenByNormalized.get(normalizeComparable(raw));
        if (normalizedMatch && !used.has(normalizedMatch)) {
            mapped.push(normalizedMatch);
            used.add(normalizedMatch);
        }
    }

    if (mapped.length === cleanTokens.length) {
        return mapped;
    }

    if (mapped.length > 0) {
        for (const token of cleanTokens) {
            if (!used.has(token)) {
                mapped.push(token);
                used.add(token);
            }
        }
        return mapped;
    }

    return cleanTokens;
}

export function repairTopicAuthoringDraft(
    draft: TopicAuthoringDraft,
): TopicAuthoringDraft {
    return {
        ...draft,
        title: normalizeText(draft.title),
        summary: normalizeText(draft.summary),
        minutes:
            typeof draft.minutes === "number" && Number.isFinite(draft.minutes)
                ? draft.minutes
                : 0,
        sketchBlocks: (draft.sketchBlocks ?? []).map((block, index) => ({
            id: normalizeText(block.id) || `sketch-${index + 1}`,
            title: normalizeText(block.title),
            bodyMarkdown: normalizeText(block.bodyMarkdown),
        })),
        quizDraft: (draft.quizDraft ?? []).map((exercise, index) => {
            const base = {
                ...exercise,
                id: normalizeText(exercise.id) || `exercise-${index + 1}`,
                title: normalizeText(exercise.title),
                prompt: normalizeText(exercise.prompt),
                hint: normalizeText(exercise.hint),
                help: {
                    concept: normalizeText(exercise.help?.concept),
                    hint_1: normalizeText(exercise.help?.hint_1),
                    hint_2: normalizeText(exercise.help?.hint_2),
                },
            };

            if (exercise.kind === "single_choice" || exercise.kind === "multi_choice") {
                const options = uniqueNonEmpty(exercise.options ?? []);
                const correctOptionIds = inferChoiceIds({
                    options,
                    rawCorrectOptionIds: exercise.correctOptionIds ?? [],
                    prompt: base.prompt,
                    hint: base.hint,
                    helpConcept: base.help.concept,
                    helpHint1: base.help.hint_1,
                    helpHint2: base.help.hint_2,
                });

                let hint = base.hint;
                let help = {
                    concept: base.help.concept,
                    hint_1: base.help.hint_1,
                    hint_2: base.help.hint_2,
                };

                const revealsOptionText =
                    containsOptionText(hint, options) ||
                    containsOptionText(help.concept, options) ||
                    containsOptionText(help.hint_1, options) ||
                    containsOptionText(help.hint_2, options);

                if (revealsOptionText) {
                    const safe = makeSafeChoiceHelp(base.prompt);
                    hint = safe.hint;
                    help = safe.help;
                }

                return {
                    ...base,
                    kind: exercise.kind,
                    options,
                    correctOptionIds,
                    hint,
                    help,
                };
            }

            if (exercise.kind === "drag_reorder") {
                const tokens = uniqueNonEmpty(exercise.tokens ?? []);
                const correctOrder = repairDragReorderCorrectOrder(
                    tokens,
                    exercise.correctOrder ?? [],
                );
                const banned = [...correctOrder];

                return {
                    ...base,
                    kind: "drag_reorder" as const,
                    tokens,
                    correctOrder,
                    hint: sanitizeHintText(base.hint, banned),
                    help: {
                        concept: sanitizeHintText(base.help.concept, banned),
                        hint_1: sanitizeHintText(base.help.hint_1, banned),
                        hint_2: sanitizeHintText(base.help.hint_2, banned),
                    },
                };
            }

            if (exercise.kind === "fill_blank_choice") {
                const choices = uniqueNonEmpty(exercise.choices ?? []);
                const correctValue = inferFillBlankCorrectValue({
                    choices,
                    correctValue: exercise.correctValue,
                    prompt: base.prompt,
                    template: exercise.template,
                    hint: base.hint,
                    helpConcept: base.help.concept,
                    helpHint1: base.help.hint_1,
                    helpHint2: base.help.hint_2,
                });

                const banned = correctValue ? [correctValue] : [];

                return {
                    ...base,
                    kind: "fill_blank_choice" as const,
                    template: normalizeText(exercise.template),
                    choices,
                    correctValue,
                    hint: sanitizeHintText(base.hint, banned),
                    help: {
                        concept: sanitizeHintText(base.help.concept, banned),
                        hint_1: sanitizeHintText(base.help.hint_1, banned),
                        hint_2: sanitizeHintText(base.help.hint_2, banned),
                    },
                };
            }

            const starterCode = normalizeText(exercise.starterCode);
            const solutionCode = normalizeText(exercise.solutionCode);
            const banned = solutionCode ? [solutionCode] : [];

            return {
                ...base,
                kind: "code_input" as const,
                starterCode,
                solutionCode,
                datasetId: normalizeText(exercise.datasetId) || undefined,
                recipeType: exercise.recipeType,
                hint: sanitizeHintText(base.hint, banned),
                help: {
                    concept: sanitizeHintText(base.help.concept, banned),
                    hint_1: sanitizeHintText(base.help.hint_1, banned),
                    hint_2: sanitizeHintText(base.help.hint_2, banned),
                },
            };
        }),
        projectDraft: draft.projectDraft
            ? {
                title: normalizeText(draft.projectDraft.title),
                stepIds: uniqueNonEmpty(draft.projectDraft.stepIds ?? []),
            }
            : undefined,
    };
}