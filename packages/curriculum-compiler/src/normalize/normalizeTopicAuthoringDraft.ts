import {
    normalizeWorkspaceExpectations,
    normalizeWorkspacePath,
    ProgrammingCodeInputFileDraft,
    ProgrammingCodeInputStarterFileDraft,
    TopicAuthoringDraft
} from "@zoeskoul/curriculum-contracts";
import {
    assertProfileSupportsCodeInput,
    getCurriculumProfile,
} from "@zoeskoul/curriculum-profiles";
import { SemanticCheckSchema } from "@zoeskoul/practice-checks";

type DraftQuizItem = TopicAuthoringDraft["quizDraft"][number];
type DraftHelp = DraftQuizItem["help"];

function asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function normalizeOptionalWorkspacePath(value: unknown, label = "workspace path"): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;

    try {
        return normalizeWorkspacePath(value);
    } catch (error) {
        throw new Error(`${label} is invalid: ${(error as Error).message}`);
    }
}

function normalizeFileDrafts(
    value: unknown,
): ProgrammingCodeInputFileDraft[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const files = value
        .filter((item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .map((item) => {
            const path = normalizeOptionalWorkspacePath(item.path, "file.path");
            if (!path) return null;

            return {
                path,
                content:
                    typeof item.content === "string"
                        ? item.content
                        : "",
                ...(typeof item.readOnly === "boolean"
                    ? { readOnly: item.readOnly }
                    : {}),
            };
        })
        .filter((file): file is ProgrammingCodeInputFileDraft => Boolean(file));

    return files.length > 0 ? files : undefined;
}

function normalizeStarterFileDrafts(
    value: unknown,
): ProgrammingCodeInputStarterFileDraft[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const files = value
        .filter((item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .map((item) => {
            const path = normalizeOptionalWorkspacePath(item.path, "starterFiles[].path");
            if (!path) return null;

            return {
                path,
                content:
                    typeof item.content === "string"
                        ? item.content
                        : "",
                ...(typeof item.language === "string" && item.language.trim()
                    ? { language: item.language.trim() as any }
                    : {}),
                ...(typeof item.isEntry === "boolean"
                    ? { isEntry: item.isEntry }
                    : {}),
                ...(typeof item.entry === "boolean"
                    ? { entry: item.entry }
                    : {}),
                ...(typeof item.readOnly === "boolean"
                    ? { readOnly: item.readOnly }
                    : {}),
            };
        })
        .filter((file): file is ProgrammingCodeInputStarterFileDraft =>
            Boolean(file),
        );

    return files.length > 0 ? files : undefined;
}

function normalizeSourceChecks(
    value: unknown,
): Array<{
    type: "source_contains" | "source_regex";
    pattern: string;
    message: string;
    normalizeWhitespace?: boolean;
}> | undefined {
    if (!Array.isArray(value)) return undefined;

    const checks = value
        .filter((item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .map((item) => {
            const type =
                item.type === "source_regex" ? "source_regex" : item.type === "source_contains"
                    ? "source_contains"
                    : null;
            const pattern = asOptionalString(item.pattern);
            const message = asOptionalString(item.message);

            if (!type || !pattern || !message) return null;

            return {
                type,
                pattern,
                message,
                ...(typeof item.normalizeWhitespace === "boolean"
                    ? { normalizeWhitespace: item.normalizeWhitespace }
                    : {}),
            };
        })
        .filter((check): check is NonNullable<typeof check> => Boolean(check));

    return checks.length > 0 ? checks : undefined;
}
function normalizeOptionText(value: unknown): string {
    if (typeof value === "string") return value.trim();

    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;

        if (typeof obj.text === "string") return obj.text.trim();
        if (typeof obj.label === "string") return obj.label.trim();
        if (typeof obj.value === "string") return obj.value.trim();
        if (typeof obj.title === "string") return obj.title.trim();
        if (typeof obj.name === "string") return obj.name.trim();
    }

    return String(value).trim();
}

function normalizeOptionsArray(
    rawOptions: unknown[],
    rawOptionIds: unknown[],
): string[] {
    if (rawOptions.length > 0) {
        return rawOptions.map(normalizeOptionText).filter(Boolean);
    }

    return rawOptionIds
        .map((x) => String(x).replace(/^option-/, "").replace(/-/g, " ").trim())
        .filter(Boolean);
}

function fallbackHint(title: string, kind: DraftQuizItem["kind"]): string {
    switch (kind) {
        case "single_choice":
        case "multi_choice":
            return `Think about the main idea behind ${title.toLowerCase()}.`;
        case "drag_reorder":
            return "Think about the logical order of the steps.";
        case "fill_blank_choice":
            return "Focus on the missing concept or keyword.";
        case "code_input":
            return "Break the task into the main code steps first.";
        default:
            return `Think about the main idea behind ${title.toLowerCase()}.`;
    }
}

function fallbackHelp(title: string, kind: DraftQuizItem["kind"]): DraftHelp {
    switch (kind) {
        case "single_choice":
        case "multi_choice":
            return {
                concept: `Focus on the core concept behind ${title.toLowerCase()}.`,
                hint_1: "Eliminate choices that do not match the main idea of the lesson.",
                hint_2: "Match the wording of the prompt to the concept practiced in the topic.",
            };
        case "drag_reorder":
            return {
                concept: `This task is about understanding the sequence behind ${title.toLowerCase()}.`,
                hint_1: "Find the step that must happen first before the others make sense.",
                hint_2: "Check which action depends on a previous step already being completed.",
            };
        case "fill_blank_choice":
            return {
                concept: `This task checks the key idea behind ${title.toLowerCase()}.`,
                hint_1: "Look for the word or phrase that best matches the lesson concept.",
                hint_2: "Compare the blank with the meaning of each choice, not just the wording.",
            };
        case "code_input":
            return {
                concept: `This task checks whether you can apply ${title.toLowerCase()} in a working solution.`,
                hint_1: "Identify the inputs, required steps, and expected result before writing the full solution.",
                hint_2: "Build the solution one piece at a time, then check that its behavior matches the prompt.",
            };
        default:
            return {
                concept: `Focus on the core concept behind ${title.toLowerCase()}.`,
                hint_1: "Break the task into smaller pieces.",
                hint_2: "Match each part of the prompt to the concept practiced in the lesson.",
            };
    }
}

function normalizeHelp(
    item: Record<string, unknown>,
    title: string,
    kind: DraftQuizItem["kind"],
): DraftHelp {
    const fallback = fallbackHelp(title, kind);
    const rawHelp =
        item.help && typeof item.help === "object"
            ? (item.help as Record<string, unknown>)
            : null;

    const legacyConcept = asOptionalString(item.concept);
    const legacyHint1 = asOptionalString(item.hint1);
    const legacyHint2 = asOptionalString(item.hint2);

    return {
        concept:
            (rawHelp && asOptionalString(rawHelp.concept)) ??
            legacyConcept ??
            fallback.concept,
        hint_1:
            (rawHelp && asOptionalString(rawHelp.hint_1)) ??
            legacyHint1 ??
            fallback.hint_1,
        hint_2:
            (rawHelp && asOptionalString(rawHelp.hint_2)) ??
            legacyHint2 ??
            fallback.hint_2,
    };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeFillBlankText(text: string, correctValue: string): string {
    if (!text.trim() || !correctValue.trim()) return text;

    const re = new RegExp(`\\b${escapeRegExp(correctValue)}\\b`, "gi");
    if (!re.test(text)) return text;

    return text.replace(re, "the missing term");
}

function normalizeSingleChoice(item: Record<string, unknown>): DraftQuizItem {
    const title =
        asOptionalString(item.title) ??
        asOptionalString(item.messageBase) ??
        asOptionalString(item.prompt) ??
        "Untitled";

    const prompt =
        asOptionalString(item.prompt) ??
        asOptionalString(item.messageBase) ??
        title;

    const rawOptionIds = Array.isArray(item.optionIds) ? item.optionIds : [];
    const rawOptions = Array.isArray(item.options) ? item.options : [];

    const options = normalizeOptionsArray(rawOptions, rawOptionIds);

    const canonicalOptionIds = options.map((_, index) =>
        String.fromCharCode(97 + index),
    );

    let resolvedCorrectOptionId: string | null = null;

    const tryCanonical = (value: unknown) => {
        const s = String(value).trim();
        if (canonicalOptionIds.includes(s)) {
            resolvedCorrectOptionId = s;
            return true;
        }
        return false;
    };

    const tryNumericIndex = (value: unknown) => {
        if (typeof value === "number" && Number.isInteger(value)) {
            const id = canonicalOptionIds[value];
            if (id) {
                resolvedCorrectOptionId = id;
                return true;
            }
        }

        if (typeof value === "string" && /^\d+$/.test(value)) {
            const idx = Number(value);
            const id = canonicalOptionIds[idx];
            if (id) {
                resolvedCorrectOptionId = id;
                return true;
            }
        }

        return false;
    };

    const tryOptionText = (value: unknown) => {
        const s = String(value).trim().toLowerCase();
        const idx = options.findIndex((opt) => opt.trim().toLowerCase() === s);
        if (idx >= 0) {
            resolvedCorrectOptionId = canonicalOptionIds[idx];
            return true;
        }
        return false;
    };

    if (Array.isArray(item.correctOptionIds) && item.correctOptionIds.length > 0) {
        const value = item.correctOptionIds[0];
        tryCanonical(value) || tryNumericIndex(value) || tryOptionText(value);
    }

    if (!resolvedCorrectOptionId && Array.isArray(item.expected) && item.expected.length > 0) {
        const value = item.expected[0];
        tryCanonical(value) || tryNumericIndex(value) || tryOptionText(value);
    }

    if (!resolvedCorrectOptionId && item.expected && typeof item.expected === "object") {
        const expectedObj = item.expected as Record<string, unknown>;

        if (Array.isArray(expectedObj.optionIds) && expectedObj.optionIds.length > 0) {
            const value = expectedObj.optionIds[0];
            tryCanonical(value) || tryNumericIndex(value) || tryOptionText(value);
        }

        if (!resolvedCorrectOptionId && typeof expectedObj.optionId !== "undefined") {
            const value = expectedObj.optionId;
            tryCanonical(value) || tryNumericIndex(value) || tryOptionText(value);
        }

        if (!resolvedCorrectOptionId && typeof expectedObj.correctOptionId !== "undefined") {
            const value = expectedObj.correctOptionId;
            tryCanonical(value) || tryNumericIndex(value) || tryOptionText(value);
        }
    }

    if (!resolvedCorrectOptionId && Array.isArray(item.correctOptions) && item.correctOptions.length > 0) {
        tryOptionText(item.correctOptions[0]);
    }

    if (!resolvedCorrectOptionId && Array.isArray(item.expectedTexts) && item.expectedTexts.length > 0) {
        tryOptionText(item.expectedTexts[0]);
    }

    return {
        id: String(item.id ?? "").trim(),
        kind: "single_choice",
        title,
        prompt,
        options,
        correctOptionIds: resolvedCorrectOptionId ? [resolvedCorrectOptionId] : [],
        hint: asOptionalString(item.hint) ?? fallbackHint(title, "single_choice"),
        help: normalizeHelp(item, title, "single_choice"),
    };
}

function normalizeMultiChoice(item: Record<string, unknown>): DraftQuizItem {
    const title =
        asOptionalString(item.title) ??
        asOptionalString(item.messageBase) ??
        asOptionalString(item.prompt) ??
        "Untitled";

    const prompt =
        asOptionalString(item.prompt) ??
        asOptionalString(item.messageBase) ??
        title;

    const rawOptionIds = Array.isArray(item.optionIds) ? item.optionIds : [];
    const rawOptions = Array.isArray(item.options) ? item.options : [];

    const options = normalizeOptionsArray(rawOptions, rawOptionIds);

    const canonicalOptionIds = options.map((_, index) =>
        String.fromCharCode(97 + index),
    );

    let correctOptionIds: string[] = [];

    if (Array.isArray(item.correctOptionIds)) {
        correctOptionIds = item.correctOptionIds
            .map((value) => String(value).trim())
            .filter((value) => canonicalOptionIds.includes(value));
    }

    if (
        correctOptionIds.length === 0 &&
        item.expected &&
        typeof item.expected === "object" &&
        Array.isArray((item.expected as Record<string, unknown>).optionIds)
    ) {
        correctOptionIds = (
            (item.expected as Record<string, unknown>).optionIds as unknown[]
        )
            .map((value) => String(value).trim())
            .filter((value) => canonicalOptionIds.includes(value));
    }

    if (correctOptionIds.length === 0 && Array.isArray(item.expected)) {
        const expectedValues = item.expected.map((x) => String(x).trim());

        const idMatches = expectedValues.filter((value) =>
            canonicalOptionIds.includes(value),
        );

        if (idMatches.length > 0) {
            correctOptionIds = idMatches;
        } else {
            correctOptionIds = options
                .map((option, index) => ({
                    option,
                    id: canonicalOptionIds[index],
                }))
                .filter(({ option }) => expectedValues.includes(option))
                .map(({ id }) => id);
        }
    }

    if (correctOptionIds.length === 0 && Array.isArray(item.correctOptions)) {
        const correctTexts = item.correctOptions.map((x) => String(x).trim());
        correctOptionIds = options
            .map((option, index) => ({
                option,
                id: canonicalOptionIds[index],
            }))
            .filter(({ option }) => correctTexts.includes(option))
            .map(({ id }) => id);
    }

    if (correctOptionIds.length === 0 && Array.isArray(item.expectedTexts)) {
        const expectedTexts = item.expectedTexts.map((x) => String(x).trim());
        correctOptionIds = options
            .map((option, index) => ({
                option,
                id: canonicalOptionIds[index],
            }))
            .filter(({ option }) => expectedTexts.includes(option))
            .map(({ id }) => id);
    }

    return {
        id: String(item.id ?? "").trim(),
        kind: "multi_choice",
        title,
        prompt,
        options,
        correctOptionIds,
        hint: asOptionalString(item.hint) ?? fallbackHint(title, "multi_choice"),
        help: normalizeHelp(item, title, "multi_choice"),
    };
}

function normalizeDragReorder(item: Record<string, unknown>): DraftQuizItem {
    const title =
        asOptionalString(item.title) ??
        asOptionalString(item.messageBase) ??
        asOptionalString(item.prompt) ??
        "Untitled";

    const prompt =
        asOptionalString(item.prompt) ??
        asOptionalString(item.messageBase) ??
        title;

    return {
        id: String(item.id ?? "").trim(),
        kind: "drag_reorder",
        title,
        prompt,
        tokens: Array.isArray(item.tokens)
            ? item.tokens.map((x) => String(x).trim()).filter(Boolean)
            : item.tokens && typeof item.tokens === "object"
                ? Object.values(item.tokens as Record<string, unknown>)
                    .map((x) => String(x).trim())
                    .filter(Boolean)
                : [],
        correctOrder: Array.isArray(item.correctOrder)
            ? item.correctOrder.map((x) => String(x).trim()).filter(Boolean)
            : Array.isArray(item.expected)
                ? item.expected.map((x) => String(x).trim()).filter(Boolean)
                : item.expected && typeof item.expected === "object"
                    ? Object.values(item.expected as Record<string, unknown>)
                        .map((x) => String(x).trim())
                        .filter(Boolean)
                    : [],
        hint: asOptionalString(item.hint) ?? fallbackHint(title, "drag_reorder"),
        help: normalizeHelp(item, title, "drag_reorder"),
    };
}

function normalizeFillBlankChoice(item: Record<string, unknown>): DraftQuizItem {
    const title =
        asOptionalString(item.title) ??
        asOptionalString(item.messageBase) ??
        asOptionalString(item.prompt) ??
        "Untitled";

    const prompt =
        asOptionalString(item.prompt) ??
        asOptionalString(item.messageBase) ??
        title;

    const correctValue =
        typeof item.correctValue === "string"
            ? item.correctValue.trim()
            : typeof item.correct === "string"
                ? item.correct.trim()
                : typeof item.expected === "string"
                    ? item.expected.trim()
                    : "";

    const rawHelp = normalizeHelp(item, title, "fill_blank_choice");

    return {
        id: String(item.id ?? "").trim(),
        kind: "fill_blank_choice",
        title,
        prompt,
        template: typeof item.template === "string" ? item.template.trim() : "",
        choices: Array.isArray(item.choices)
            ? item.choices.map((x) => String(x).trim()).filter(Boolean)
            : item.choices && typeof item.choices === "object"
                ? Object.values(item.choices as Record<string, unknown>)
                    .map((x) => String(x).trim())
                    .filter(Boolean)
                : [],
        correctValue,
        hint: sanitizeFillBlankText(
            asOptionalString(item.hint) ?? fallbackHint(title, "fill_blank_choice"),
            correctValue,
        ),
        help: {
            concept: sanitizeFillBlankText(rawHelp.concept, correctValue),
            hint_1: sanitizeFillBlankText(rawHelp.hint_1, correctValue),
            hint_2: sanitizeFillBlankText(rawHelp.hint_2, correctValue),
        },
    };
}





















function inferCodeInputLanguage(item: Record<string, unknown>): string | undefined {
    const fixedLanguage =
        typeof item.fixedLanguage === "string" ? item.fixedLanguage.trim() : "";

    const language =
        typeof item.language === "string" ? item.language.trim() : "";

    const runtime =
        item.runtime && typeof item.runtime === "object"
            ? (item.runtime as Record<string, unknown>)
            : null;

    const runtimeKind =
        typeof runtime?.kind === "string" ? runtime.kind.trim() : "";

    if (fixedLanguage) return fixedLanguage;
    if (language) return language;
    if (runtimeKind === "sql") return "sql";

    return undefined;
}

function defaultStarterCodeForCodeInput(args: {
    item: Record<string, unknown>;
    profileId?: string;
}): string {
    const recipeType =
        typeof args.item.recipeType === "string"
            ? args.item.recipeType.trim()
            : typeof args.item.type === "string"
                ? args.item.type.trim()
                : "";
    const hasDatasetId =
        typeof args.item.datasetId === "string" && args.item.datasetId.trim().length > 0;

    if (!args.profileId) {
        throw new Error(
            "Cannot create default starterCode for code_input without a curriculum profile. Pass profileId so starter defaults stay profile-owned.",
        );
    }

    const codeInput = assertProfileSupportsCodeInput(
        getCurriculumProfile(args.profileId),
    );

    return codeInput.defaultStarter({
        language: inferCodeInputLanguage(args.item),
        recipeType,
        hasDatasetId,
    });
}

function normalizeCodeInput(
    item: Record<string, unknown>,
    context?: { profileId?: string },
): DraftQuizItem {
    if (context?.profileId) {
        assertProfileSupportsCodeInput(getCurriculumProfile(context.profileId));
    }

    const title =
        asOptionalString(item.title) ??
        asOptionalString(item.messageBase) ??
        asOptionalString(item.prompt) ??
        "Untitled";

    const prompt =
        asOptionalString(item.prompt) ??
        asOptionalString(item.messageBase) ??
        title;

    const recipeType =
        typeof item.recipeType === "string"
            ? item.recipeType.trim()
            : typeof item.type === "string"
                ? item.type.trim()
                : undefined;

    const starterCode =
        typeof item.starterCode === "string" && item.starterCode.trim().length > 0
            ? item.starterCode
            : defaultStarterCodeForCodeInput({
                item,
                profileId: context?.profileId,
            });

    const tests = Array.isArray(item.tests)
        ? item.tests
            .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
            .map((x) => {
                const match: "exact" | "includes" | undefined =
                    x.match === "includes" || x.match === "exact"
                        ? x.match
                        : undefined;

                const files = normalizeFileDrafts(x.files);

                return {
                    stdin:
                        typeof x.stdin === "string"
                            ? x.stdin
                            : typeof x.input === "string"
                                ? x.input
                                : undefined,
                    stdout:
                        typeof x.stdout === "string"
                            ? x.stdout
                            : typeof x.output === "string"
                                ? x.output
                                : "",
                    match,
                    ...(files?.length ? { files } : {}),
                };
            })
            .filter((x) => x.stdout.trim().length > 0)
        : undefined;
    const semanticChecksResult = SemanticCheckSchema.array().safeParse(
        (item as { semanticChecks?: unknown }).semanticChecks,
    );

    const semanticChecks =
        semanticChecksResult.success && semanticChecksResult.data.length
            ? semanticChecksResult.data
            : undefined;
    const starterFiles = normalizeStarterFileDrafts(item.starterFiles);
    const solutionFiles = normalizeStarterFileDrafts(item.solutionFiles);
    const files = normalizeFileDrafts(item.files);
    const sourceChecks = normalizeSourceChecks(item.sourceChecks);
    const entryFilePath = normalizeOptionalWorkspacePath(item.entryFilePath, "entryFilePath");
    const workspaceExpectations =
        typeof item.workspaceExpectations === "undefined"
            ? undefined
            : normalizeWorkspaceExpectations(
                item.workspaceExpectations,
                "workspaceExpectations",
            );
    return {
        id: String(item.id ?? "").trim(),
        kind: "code_input",
        title,
        prompt,
        starterCode,
        ...(entryFilePath ? { entryFilePath } : {}),
        ...(starterFiles?.length ? { starterFiles } : {}),
        ...(solutionFiles?.length ? { solutionFiles } : {}),
        ...(sourceChecks?.length ? { sourceChecks } : {}),
        ...(workspaceExpectations ? { workspaceExpectations } : {}),
        solutionCode:
            typeof item.solutionCode === "string" ? item.solutionCode : "",
        ...(tests?.length ? { tests } : {}),
        ...(files?.length ? { files } : {}),
        datasetId:
            typeof item.datasetId === "string"
                ? item.datasetId.trim() || undefined
                : undefined,
        recipeType:
            recipeType === "sql_query" ||
            recipeType === "template_io" ||
            recipeType === "fixed_tests" ||
            recipeType === "semantic"
                ? recipeType
                : undefined,
        ...(semanticChecks?.length ? { semanticChecks } : {}),
        checkSql:
            typeof item.checkSql === "string"
                ? item.checkSql.trim() || undefined
                : undefined,
        hint: asOptionalString(item.hint) ?? fallbackHint(title, "code_input"),
        help: normalizeHelp(item, title, "code_input"),
    };
}

function normalizeQuizItem(
    item: Record<string, unknown>,
    context?: { profileId?: string },
): DraftQuizItem {
    const rawKind = typeof item.kind === "string" ? item.kind : "";

    if (rawKind === "single_choice") return normalizeSingleChoice(item);
    if (rawKind === "multi_choice") return normalizeMultiChoice(item);
    if (rawKind === "drag_reorder") return normalizeDragReorder(item);
    if (rawKind === "fill_blank_choice") return normalizeFillBlankChoice(item);
    if (rawKind === "code_input") return normalizeCodeInput(item, context);

    const title =
        asOptionalString(item.title) ??
        asOptionalString(item.messageBase) ??
        asOptionalString(item.prompt) ??
        "Untitled";

    const prompt =
        asOptionalString(item.prompt) ??
        asOptionalString(item.messageBase) ??
        title;

    return {
        id: String(item.id ?? "").trim(),
        kind: "single_choice",
        title,
        prompt,
        options: [],
        correctOptionIds: [],
        hint: asOptionalString(item.hint) ?? fallbackHint(title, "single_choice"),
        help: normalizeHelp(item, title, "single_choice"),
    };
}

export function normalizeTopicAuthoringDraft(
    raw: unknown,
    context?: { profileId?: string },
): TopicAuthoringDraft {
    const draft = (raw && typeof raw === "object" ? raw : {}) as Record<
        string,
        unknown
    >;

    return {
        title: asOptionalString(draft.title) ?? "Untitled Topic",
        summary: asOptionalString(draft.summary) ?? "",
        minutes:
            typeof draft.minutes === "number" && Number.isFinite(draft.minutes)
                ? draft.minutes
                : 10,
        sketchBlocks: Array.isArray(draft.sketchBlocks)
            ? draft.sketchBlocks
                .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
                .map((x) => ({
                    id: asOptionalString(x.id) ?? "sketch",
                    title: asOptionalString(x.title) ?? "Sketch",
                    bodyMarkdown: asOptionalString(x.bodyMarkdown) ?? "",
                }))
            : [],
        quizDraft: Array.isArray(draft.quizDraft)
            ? draft.quizDraft
                .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
                .map((item) => normalizeQuizItem(item, context))
            : [],
        projectDraft:
            draft.projectDraft && typeof draft.projectDraft === "object"
                ? {
                    title:
                        asOptionalString(
                            (draft.projectDraft as Record<string, unknown>).title,
                        ) ?? "Project",
                    stepIds: Array.isArray(
                        (draft.projectDraft as Record<string, unknown>).stepIds,
                    )
                        ? (
                            (draft.projectDraft as Record<string, unknown>)
                                .stepIds as unknown[]
                        )
                            .map((x) => String(x).trim())
                            .filter(Boolean)
                        : [],
                }
                : undefined,
    };
}
