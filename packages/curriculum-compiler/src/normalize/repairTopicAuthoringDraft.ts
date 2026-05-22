import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import {RetryableTopicValidationError} from "../validate/RetryableTopicValidationError.js";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function normalizeComparable(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[`"'.,;:!?()[\]{}]/g, "")
        .replace(/\s+/g, " ");
}

function canonicalOptionIds(count: number): string[] {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));
}

function resolveCorrectOptionTexts(options: string[], correctOptionIds: string[]): string[] {
    const ids = canonicalOptionIds(options.length);

    return correctOptionIds
        .map((id) => {
            const index = ids.indexOf(id);
            return index >= 0 ? options[index] : "";
        })
        .filter(Boolean);
}

function containsAnyAnswerText(text: string, answers: string[]): boolean {
    const normalizedText = normalizeComparable(text);
    if (!normalizedText) return false;

    return answers.some((answer) => {
        const normalizedAnswer = normalizeComparable(answer);
        return normalizedAnswer && normalizedText.includes(normalizedAnswer);
    });
}

function stripAnswerLeakFromTexts(args: {
    hint: string;
    help: {
        concept: string;
        hint_1: string;
        hint_2: string;
    };
    bannedAnswers: string[];
    fallback: {
        hint: string;
        help: {
            concept: string;
            hint_1: string;
            hint_2: string;
        };
    };
}) {
    const revealsOriginal =
        containsAnyAnswerText(args.hint, args.bannedAnswers) ||
        containsAnyAnswerText(args.help.concept, args.bannedAnswers) ||
        containsAnyAnswerText(args.help.hint_1, args.bannedAnswers) ||
        containsAnyAnswerText(args.help.hint_2, args.bannedAnswers);

    if (!revealsOriginal) {
        return {
            hint: args.hint,
            help: args.help,
        };
    }

    const fallbackReveals =
        containsAnyAnswerText(args.fallback.hint, args.bannedAnswers) ||
        containsAnyAnswerText(args.fallback.help.concept, args.bannedAnswers) ||
        containsAnyAnswerText(args.fallback.help.hint_1, args.bannedAnswers) ||
        containsAnyAnswerText(args.fallback.help.hint_2, args.bannedAnswers);

    if (!fallbackReveals) {
        return args.fallback;
    }

    return {
        hint: "Use the lesson explanation and the wording of this question to narrow the answer.",
        help: {
            concept: "This support text was repaired because the original wording revealed the answer too directly.",
            hint_1: "Compare the question to the lesson example and remove choices from unrelated topics.",
            hint_2: "Choose the option that directly matches the question without relying on answer wording.",
        },
    };
}

function makeSafeChoiceHelp(args: {
    title: string;
    prompt: string;
    options: string[];
}) {
    const question = args.title || args.prompt || "this question";
    const optionList = args.options.length
        ? ` The choices are: ${args.options.join(", ")}.`
        : "";

    return {
        hint: `Connect the question "${question}" to the lesson example before choosing.${optionList}`,
        help: {
            concept: `This question checks the specific idea in: "${question}". Compare each choice to that idea.`,
            hint_1: "Look for the choice that fits the exact topic named in the question.",
            hint_2: "Ignore choices that belong to a different Python use case or concept.",
        },
    };
}
function makeSafeFillBlankHelp() {
    return {
        hint: "Read the sentence around the blank and decide what role the missing word plays.",
        help: {
            concept:
                "The blank should be filled with the term that makes the statement accurate.",
            hint_1:
                "Look at the words before and after the blank to infer what kind of term is needed.",
            hint_2:
                "Pick the choice that completes the statement with the clearest meaning.",
        },
    };
}
function makeSafeDragReorderHelp() {
    return {
        hint: "Read each piece and arrange them in the order the statement should be understood.",
        help: {
            concept:
                "The pieces should form a valid statement in a logical order.",
            hint_1:
                "Start with the piece that introduces the idea or action.",
            hint_2:
                "Place dependent pieces after the part they describe or complete.",
        },
    };
}

function makeSafeCodeHelp(args: {
    title: string;
    prompt: string;
    seed?: TopicSeed;
}) {
    const task = args.title || args.prompt || "this coding task";
    const editorLabel =
        args.seed?.workspacePolicy?.workspace.ui.editorLabel ??
        (args.seed?.profileId === "sql" ? "SQL editor" : "code editor");
    const runButtonLabel =
        args.seed?.workspacePolicy?.workspace.ui.runButtonLabel ??
        (args.seed?.profileId === "sql" ? "Run query" : "Run");
    const resultsLabel =
        args.seed?.workspacePolicy?.workspace.ui.resultsTableLabel ??
        args.seed?.workspacePolicy?.workspace.ui.outputPanelLabel ??
        (args.seed?.profileId === "sql" ? "results table" : "output panel");

    if (args.seed?.profileId === "sql") {
        return {
            hint: `Read the task "${task}" and focus on the query pattern you need.`,
            help: {
                concept: `This SQL exercise checks whether your query returns the requested result for: "${task}".`,
                hint_1: `Check the table name and selected columns in the ${editorLabel}.`,
                hint_2: `Click ${runButtonLabel} and compare the ${resultsLabel} with the expected result.`,
            },
        };
    }

    return {
        hint: `Read the task "${task}" and identify the required result.`,
        help: {
            concept: `This coding exercise checks whether your code produces the requested result for: "${task}".`,
            hint_1: `Use the statement or expression that matches the required behavior in the ${editorLabel}.`,
            hint_2: `Click ${runButtonLabel} and compare the ${resultsLabel} with the expected result.`,
        },
    };
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
    const choices = uniqueNonEmpty(args.choices);

    function matchChoice(candidate: string | undefined): string {
        const normalizedCandidate = normalizeComparable(normalizeText(candidate));
        if (!normalizedCandidate) return "";

        const exact = choices.find(
            (choice) => normalizeComparable(choice) === normalizedCandidate,
        );
        if (exact) return exact;

        const loose = choices.find((choice) => {
            const normalizedChoice = normalizeComparable(choice);
            return (
                normalizedChoice.includes(normalizedCandidate) ||
                normalizedCandidate.includes(normalizedChoice)
            );
        });
        if (loose) return loose;

        return "";
    }

    const explicitMatch = matchChoice(args.correctValue);
    if (explicitMatch) return explicitMatch;

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

function extractBannedCodeFragments(solutionCode: string): string[] {
    const raw = solutionCode
        .split(/\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length >= 4);

    const joined: string[] = [];
    for (let i = 0; i < raw.length - 1; i += 1) {
        joined.push(`${raw[i]} ${raw[i + 1]}`);
    }

    return uniqueNonEmpty([...raw, ...joined]).slice(0, 20);
}

function countFillBlanks(template: string, prompt: string): number {
    const t = String(template ?? "");
    const p = String(prompt ?? "");

    const templateBracketBlanks = (t.match(/\[blank\d*\]/gi) ?? []).length;
    const templateUnderscoreBlanks = (t.match(/_{2,}/g) ?? []).length;
    const promptUnderscoreBlanks = (p.match(/_{2,}/g) ?? []).length;

    return templateBracketBlanks + templateUnderscoreBlanks + promptUnderscoreBlanks;
}

function rewriteInvalidFillBlankAsSingleBlank(args: {
    base: {
        id: string;
        title: string;
        prompt: string;
        hint: string;
        help: {
            concept: string;
            hint_1: string;
            hint_2: string;
        };
    };
    template: string;
    choices: string[];
    correctValue: string;
    reason: "missing_blank" | "multiple_blanks";
}) {
    const safe = makeSafeFillBlankHelp();

    const cleanedPrompt = normalizeText(args.base.prompt)
        .replace(/\[blank\d*\]/gi, "the missing choice")
        .replace(/_{2,}/g, "the missing choice");

    let sawBlank = false;

    let repairedTemplate = normalizeText(args.template)
        .replace(/\[blank\d*\]/gi, () => {
            if (!sawBlank) {
                sawBlank = true;
                return "[blank1]";
            }

            return args.correctValue || "value";
        })
        .replace(/_{2,}/g, () => {
            if (!sawBlank) {
                sawBlank = true;
                return "[blank1]";
            }

            return args.correctValue || "value";
        });

    if (!sawBlank) {
        repairedTemplate = repairedTemplate
            ? `${repairedTemplate}\n\nAnswer: [blank1]`
            : `${cleanedPrompt}\n\nAnswer: [blank1]`;
    }

    const sanitized = stripAnswerLeakFromTexts({
        hint: args.base.hint || safe.hint,
        help: {
            concept: args.base.help.concept || safe.help.concept,
            hint_1: args.base.help.hint_1 || safe.help.hint_1,
            hint_2: args.base.help.hint_2 || safe.help.hint_2,
        },
        bannedAnswers: args.correctValue ? [args.correctValue] : [],
        fallback: safe,
    });

    return {
        ...args.base,
        kind: "fill_blank_choice" as const,
        prompt: cleanedPrompt,
        template: repairedTemplate,
        choices: args.choices,
        correctValue: args.correctValue || args.choices[0] || "",
        hint: sanitized.hint,
        help: sanitized.help,
    };
}
function dedupeCaseInsensitive(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const value of values.map(normalizeText)) {
        const normalized = normalizeComparable(value);
        if (!value || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(value);
    }

    return out;
}

function buildFallbackDistractors(correctText: string): string[] {
    const defaults = [
        "A command",
        "A table name",
        "A database object",
        "An unrelated value",
        "A column group",
        "A temporary result",
    ];

    return defaults.filter(
        (candidate) =>
            normalizeComparable(candidate) !== normalizeComparable(correctText),
    );
}

function ensureMinimumChoiceOptions(args: {
    options: string[];
    correctOptionIds: string[];
}): {
    options: string[];
    correctOptionIds: string[];
} {
    const options = dedupeCaseInsensitive(args.options);
    let correctOptionIds = [...args.correctOptionIds];

    const correctTexts = resolveCorrectOptionTexts(options, correctOptionIds);
    const primaryCorrectText = correctTexts[0] ?? options[0] ?? "Correct answer";

    if (options.length >= 2) {
        return { options, correctOptionIds };
    }

    const distractors = buildFallbackDistractors(primaryCorrectText);

    for (const distractor of distractors) {
        if (options.length >= 2) break;

        const exists = options.some(
            (option) =>
                normalizeComparable(option) === normalizeComparable(distractor),
        );

        if (!exists) {
            options.push(distractor);
        }
    }

    const newOptionIds = canonicalOptionIds(options.length);

    if (correctOptionIds.length === 0 && newOptionIds.length > 0) {
        correctOptionIds = [newOptionIds[0]];
    }

    return {
        options,
        correctOptionIds,
    };
}
export function repairTopicAuthoringDraft(
    draft: TopicAuthoringDraft,
    seed?: TopicSeed,
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
                let options = uniqueNonEmpty(exercise.options ?? []);
                let correctOptionIds = inferChoiceIds({
                    options,
                    rawCorrectOptionIds: exercise.correctOptionIds ?? [],
                    prompt: base.prompt,
                    hint: base.hint,
                    helpConcept: base.help.concept,
                    helpHint1: base.help.hint_1,
                    helpHint2: base.help.hint_2,
                });

                let optionIds = canonicalOptionIds(options.length);

                if (exercise.kind === "single_choice") {
                    if (correctOptionIds.length === 0 && optionIds.length > 0) {
                        correctOptionIds = [optionIds[0]];
                    } else if (correctOptionIds.length > 1) {
                        correctOptionIds = [correctOptionIds[0]];
                    }
                }

                if (exercise.kind === "multi_choice") {
                    if (correctOptionIds.length === 0 && optionIds.length > 0) {
                        correctOptionIds = [optionIds[0]];
                    }
                }

                const repaired = ensureMinimumChoiceOptions({
                    options,
                    correctOptionIds,
                });

                options = repaired.options;
                correctOptionIds = repaired.correctOptionIds;
                optionIds = canonicalOptionIds(options.length);

                if (exercise.kind === "single_choice") {
                    if (correctOptionIds.length === 0 && optionIds.length > 0) {
                        correctOptionIds = [optionIds[0]];
                    } else if (correctOptionIds.length > 1) {
                        correctOptionIds = [correctOptionIds[0]];
                    }
                }

                if (exercise.kind === "multi_choice") {
                    if (correctOptionIds.length === 0 && optionIds.length > 0) {
                        correctOptionIds = [optionIds[0]];
                    }
                }

                const correctOptionTexts = resolveCorrectOptionTexts(options, correctOptionIds);

                const sanitized = stripAnswerLeakFromTexts({
                    hint: base.hint,
                    help: {
                        concept: base.help.concept,
                        hint_1: base.help.hint_1,
                        hint_2: base.help.hint_2,
                    },
                    bannedAnswers: correctOptionTexts,
                    fallback: makeSafeChoiceHelp({
                        title: base.title,
                        prompt: base.prompt,
                        options,
                    }),
                });

                return {
                    ...base,
                    kind: exercise.kind,
                    options,
                    correctOptionIds,
                    hint: sanitized.hint,
                    help: sanitized.help,
                };
            }
            if (exercise.kind === "drag_reorder") {
                const tokens = uniqueNonEmpty(exercise.tokens ?? []);
                const correctOrder = repairDragReorderCorrectOrder(
                    tokens,
                    exercise.correctOrder ?? [],
                );

                const sanitized = stripAnswerLeakFromTexts({
                    hint: base.hint,
                    help: {
                        concept: base.help.concept,
                        hint_1: base.help.hint_1,
                        hint_2: base.help.hint_2,
                    },
                    bannedAnswers: correctOrder,
                    fallback: makeSafeDragReorderHelp(),
                });

                return {
                    ...base,
                    kind: "drag_reorder" as const,
                    tokens,
                    correctOrder,
                    hint: sanitized.hint,
                    help: sanitized.help,
                };
            }

            if (exercise.kind === "fill_blank_choice") {
                const choices = uniqueNonEmpty(exercise.choices ?? []);
                const template = normalizeText(exercise.template);
                const blankCount = countFillBlanks(template, base.prompt);

                let correctValue = inferFillBlankCorrectValue({
                    choices,
                    correctValue: exercise.correctValue,
                    prompt: base.prompt,
                    template,
                    hint: base.hint,
                    helpConcept: base.help.concept,
                    helpHint1: base.help.hint_1,
                    helpHint2: base.help.hint_2,
                });

                if (!correctValue && choices.length > 0) {
                    correctValue = choices[0];
                }

                if (blankCount === 0) {
                    return rewriteInvalidFillBlankAsSingleBlank({
                        base,
                        template,
                        choices,
                        correctValue,
                        reason: "missing_blank",
                    });
                }

                if (blankCount > 1) {
                    return rewriteInvalidFillBlankAsSingleBlank({
                        base,
                        template,
                        choices,
                        correctValue,
                        reason: "missing_blank",
                    });
                }

                const sanitized = stripAnswerLeakFromTexts({
                    hint: base.hint,
                    help: {
                        concept: base.help.concept,
                        hint_1: base.help.hint_1,
                        hint_2: base.help.hint_2,
                    },
                    bannedAnswers: correctValue ? [correctValue] : [],
                    fallback: makeSafeFillBlankHelp(),
                });

                return {
                    ...base,
                    kind: "fill_blank_choice" as const,
                    template,
                    choices,
                    correctValue,
                    hint: sanitized.hint,
                    help: sanitized.help,
                };
            }

            const starterCode = normalizeText(exercise.starterCode);
            const solutionCode = normalizeText(exercise.solutionCode);
            const bannedAnswers = extractBannedCodeFragments(solutionCode);

            const sanitized = stripAnswerLeakFromTexts({
                hint: base.hint,
                help: {
                    concept: base.help.concept,
                    hint_1: base.help.hint_1,
                    hint_2: base.help.hint_2,
                },
                bannedAnswers,
                    fallback: makeSafeCodeHelp({
                        title: base.title,
                        prompt: base.prompt,
                        seed,
                    }),
                });
            const fallback = makeSafeCodeHelp({
                title: base.title,
                prompt: base.prompt,
                seed,
            });

            return {
                ...base,
                kind: "code_input" as const,
                starterCode,
                solutionCode,
                datasetId: normalizeText(exercise.datasetId) || undefined,
                recipeType: exercise.recipeType,
                hint: sanitized.hint || fallback.hint,
                help: {
                    concept: sanitized.help.concept || fallback.help.concept,
                    hint_1: sanitized.help.hint_1 || fallback.help.hint_1,
                    hint_2: sanitized.help.hint_2 || fallback.help.hint_2,
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
