import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";

const VALID_RECIPE_TYPES = new Set([
    "sql_query",
    "fixed_tests",
    "semantic",
    "template_io",
]);

const VALID_MATCH_TYPES = new Set(["exact", "includes"]);
const PYTHON_MAX_FIXTURE_CONTENT_LENGTH = 600;

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}
const VALID_SEMANTIC_VALUE_KINDS = new Set([
    "value",
    "dict_entries",
    "list_of_dict_entries",
]);

function looksLikeEntryPair(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string"
    );
}

function looksLikeDictEntries(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(looksLikeEntryPair)
    );
}

function looksLikeListOfDictEntries(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(looksLikeDictEntries)
    );
}

function inferSemanticValueKind(
    value: unknown,
    explicitKind?: string,
): string | undefined {
    if (explicitKind && explicitKind !== "value") {
        return explicitKind;
    }

    if (looksLikeListOfDictEntries(value)) {
        return "list_of_dict_entries";
    }

    if (looksLikeDictEntries(value)) {
        return "dict_entries";
    }

    return explicitKind;
}

function sanitizeSemanticValueKindForValue(
    value: unknown,
    rawKind: unknown,
): string | undefined {
    return inferSemanticValueKind(value, sanitizeSemanticValueKind(rawKind));
}

function sanitizeSemanticValueKindsForValues(
    values: unknown[],
    rawKinds: unknown,
): string[] | undefined {
    const sourceKinds = Array.isArray(rawKinds) ? rawKinds : [];

    const kinds = values.map((value, index) =>
        sanitizeSemanticValueKindForValue(value, sourceKinds[index]) ?? "value",
    );

    const hasMeaningfulKind =
        kinds.some((kind) => kind !== "value") ||
        sourceKinds.some((kind) => Boolean(sanitizeSemanticValueKind(kind)));

    return hasMeaningfulKind ? kinds : undefined;
}
function sanitizeSemanticValueKind(value: unknown): string | undefined {
    const normalized = normalizeText(value);
    return VALID_SEMANTIC_VALUE_KINDS.has(normalized) ? normalized : undefined;
}

function sanitizeSemanticValueKindArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const kinds = value
        .map(sanitizeSemanticValueKind)
        .filter((kind): kind is string => Boolean(kind));

    return kinds.length ? kinds : undefined;
}
function isInvalidFixturePath(path: string): boolean {
    return (
        !path ||
        path.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(path) ||
        path.includes("\\") ||
        path
            .split("/")
            .some(
                (segment) =>
                    !segment ||
                    segment === "." ||
                    segment === ".." ||
                    segment.includes("\0"),
            )
    );
}

function sanitizeFixtureContent(value: unknown): string {
    const normalized = String(value ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n");

    const lines = normalized.split("\n");

    while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
        lines.pop();
    }

    const trimmed = lines.join("\n");

    if (trimmed.length <= PYTHON_MAX_FIXTURE_CONTENT_LENGTH) {
        return trimmed;
    }

    const limited: string[] = [];

    for (const line of lines) {
        const candidate =
            limited.length > 0 ? `${limited.join("\n")}\n${line}` : line;

        if (candidate.length > PYTHON_MAX_FIXTURE_CONTENT_LENGTH) {
            break;
        }

        limited.push(line);
    }

    return limited.length > 0
        ? limited.join("\n")
        : trimmed.slice(0, PYTHON_MAX_FIXTURE_CONTENT_LENGTH).trimEnd();
}
function sanitizeHelp(value: unknown): Record<string, unknown> {
    if (isRecord(value)) {
        return {
            concept: normalizeText(value.concept) || "Review the main idea in this lesson.",
            hint_1: normalizeText(value.hint_1) || "Look for the option that matches the lesson example.",
            hint_2: normalizeText(value.hint_2) || "Eliminate choices that do not match the required behavior.",
        };
    }

    return {
        concept: "Review the main idea in this lesson.",
        hint_1: "Look for the option that matches the lesson example.",
        hint_2: "Eliminate choices that do not match the required behavior.",
    };
}

function sanitizeExerciseBase(exercise: Record<string, unknown>) {
    return {
        id: normalizeText(exercise.id) || "exercise",
        kind: normalizeText(exercise.kind),
        title: normalizeText(exercise.title) || "Practice",
        prompt: normalizeText(exercise.prompt) || "Choose the best answer.",
        hint: normalizeText(exercise.hint) || "Use the lesson examples to decide.",
        help: sanitizeHelp(exercise.help),
    };
}

function sanitizeNonCodeExercise(
    exercise: Record<string, unknown>,
): Record<string, unknown> {
    const base = sanitizeExerciseBase(exercise);
    const kind = base.kind;

    if (kind === "single_choice" || kind === "multi_choice") {
        return {
            ...base,
            kind,
            options: Array.isArray(exercise.options)
                ? exercise.options
                    .map((option) => normalizeText(option))
                    .filter(Boolean)
                : [],
            correctOptionIds: Array.isArray(exercise.correctOptionIds)
                ? exercise.correctOptionIds
                    .map((id) => normalizeText(id))
                    .filter(Boolean)
                : [],
        };
    }

    if (kind === "drag_reorder") {
        return {
            ...base,
            kind,
            tokens: Array.isArray(exercise.tokens)
                ? exercise.tokens
                    .map((token) => normalizeText(token))
                    .filter(Boolean)
                : [],
            correctOrder: Array.isArray(exercise.correctOrder)
                ? exercise.correctOrder
                    .map((token) => normalizeText(token))
                    .filter(Boolean)
                : [],
        };
    }

    if (kind === "fill_blank_choice") {
        return {
            ...base,
            kind,
            template: normalizeText(exercise.template),
            choices: Array.isArray(exercise.choices)
                ? exercise.choices
                    .map((choice) => normalizeText(choice))
                    .filter(Boolean)
                : [],
            correctValue: normalizeText(exercise.correctValue),
        };
    }

    return exercise;
}
function sanitizeFixtureList(
    files: unknown,
): Record<string, unknown>[] | undefined {
    if (!Array.isArray(files)) return undefined;

    const seen = new Set<string>();

    const sanitized = files
        .filter(isRecord)
        .map((file) => {
            const path = normalizeText(file.path);

            if (isInvalidFixturePath(path) || seen.has(path)) {
                return null;
            }

            seen.add(path);

            const nextFile: Record<string, unknown> = {
                path,
                content: sanitizeFixtureContent(file.content),
            };

            if (typeof file.readOnly === "boolean") {
                nextFile.readOnly = file.readOnly;
            }

            return nextFile;
        })
        .filter((file): file is Record<string, unknown> => !!file);

    return sanitized.length > 0 ? sanitized : undefined;
}

function firstNonEmptyString(...values: unknown[]): string {
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized) return normalized;
    }

    return "";
}

function findEntryFixtureContent(
    files: Record<string, unknown>[] | undefined,
    entryFilePath: string,
): string {
    if (!files?.length) return "";

    const preferredPaths = [entryFilePath, "main.py", "src/main.py"]
        .map((path) => normalizeText(path))
        .filter(Boolean);

    for (const preferredPath of preferredPaths) {
        const match = files.find((file) => normalizeText(file.path) === preferredPath);
        const content = normalizeText(match?.content);
        if (content) return content;
    }

    const firstPythonFile = files.find((file) => normalizeText(file.path).endsWith(".py"));
    const pythonContent = normalizeText(firstPythonFile?.content);
    if (pythonContent) return pythonContent;

    const firstContent = files.map((file) => normalizeText(file.content)).find(Boolean);
    return firstContent ?? "";
}

function ensureCodeInputRequiredCodeFields(
    exercise: Record<string, unknown>,
    files: Record<string, unknown>[] | undefined,
): void {
    const entryFilePath = firstNonEmptyString(exercise.entryFilePath, "main.py");
    const entryContent = findEntryFixtureContent(files, entryFilePath);

    if (!normalizeText(exercise.starterCode)) {
        exercise.starterCode = entryContent || "# Write your code below.\n";
    }

    if (!normalizeText(exercise.solutionCode)) {
        exercise.solutionCode = entryContent || String(exercise.starterCode ?? "# Write your code below.\n");
    }
}

function sanitizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const items = value
        .map((item) => normalizeText(item))
        .filter((item) => item.length > 0);

    return items.length > 0 ? items : undefined;
}

function sanitizeTest(test: unknown): Record<string, unknown> | null {
    if (!isRecord(test)) return null;

    const stdout =
        typeof test.stdout === "string"
            ? test.stdout
            : typeof test.output === "string"
                ? test.output
                : "";

    if (stdout.trim().length < 1) {
        return null;
    }

    const next: Record<string, unknown> = {
        stdout,
    };

    if (typeof test.stdin === "string") {
        next.stdin = test.stdin;
    } else if (typeof test.input === "string") {
        next.stdin = test.input;
    }

    if (VALID_MATCH_TYPES.has(String(test.match))) {
        next.match = test.match;
    }

    const files = sanitizeFixtureList(test.files);

    if (files) {
        next.files = files;
    }

    return next;
}

function sanitizeSemanticCheck(check: unknown): Record<string, unknown> | null {
    if (!isRecord(check)) return null;

    const type = normalizeText(check.type);

    if (!type) return null;

    const message = normalizeText(check.message);
    if (type === "function_returns") {
        const functionName =
            normalizeText(check.functionName) ||
            normalizeText(check.methodName);

        if (!functionName || !("expected" in check)) {
            return null;
        }

        const args = Array.isArray(check.args)
            ? check.args
            : Array.isArray(check.methodArgs)
                ? check.methodArgs
                : [];

        const argKinds = sanitizeSemanticValueKindsForValues(args, check.argKinds);
        const expectedKind = sanitizeSemanticValueKindForValue(
            check.expected,
            check.expectedKind,
        );

        return {
            type,
            functionName,
            args,
            ...(argKinds ? { argKinds } : {}),
            expected: check.expected,
            ...(expectedKind ? { expectedKind } : {}),
            ...(message ? { message } : {}),
        };
    }

    if (type === "defines_class") {
        const className = normalizeText(check.className);

        if (!className) return null;

        return {
            type,
            className,
            ...(message ? { message } : {}),
        };
    }

    if (type === "constructible") {
        const className = normalizeText(check.className);

        if (!className) return null;

        return {
            type,
            className,
            constructorArgs: Array.isArray(check.constructorArgs)
                ? check.constructorArgs
                : [],
            ...(message ? { message } : {}),
        };
    }

    if (type === "instance_attributes") {
        const className = normalizeText(check.className);
        const attributes = sanitizeStringArray(check.attributes);

        if (!className || !attributes) return null;

        return {
            type,
            className,
            constructorArgs: Array.isArray(check.constructorArgs)
                ? check.constructorArgs
                : [],
            attributes,
            ...(message ? { message } : {}),
        };
    }
    // Common model mistake:
    // It sometimes uses method_returns for a plain function.
    // If className is missing but methodName exists, treat it as function_returns.
    if (type === "method_returns" && !normalizeText(check.className)) {
        const functionName = normalizeText(check.methodName);

        if (!functionName || !("expected" in check)) {
            return null;
        }

        return {
            type: "function_returns",
            functionName,
            args: Array.isArray(check.methodArgs) ? check.methodArgs : [],
            expected: check.expected,
            ...(message ? { message } : {}),
        };
    }

    if (type === "no_stdout") {
        return {
            type,
            ...(message ? { message } : {}),
        };
    }
    if (
        type === "method_returns" ||
        type === "method_sequence_returns" ||
        type === "attribute_sequence_equals"
    ) {
        const className = normalizeText(check.className);
        const methodName = normalizeText(check.methodName);
        const attributeName = normalizeText(check.attributeName);

        if (!className || !("expected" in check)) {
            return null;
        }

        if (type === "attribute_sequence_equals" && !attributeName) {
            return null;
        }

        if (type !== "attribute_sequence_equals" && !methodName) {
            return null;
        }

        const constructorArgs = Array.isArray(check.constructorArgs)
            ? check.constructorArgs
            : [];

        const methodArgs = Array.isArray(check.methodArgs)
            ? check.methodArgs
            : [];

        const constructorArgKinds = sanitizeSemanticValueKindsForValues(
            constructorArgs,
            check.constructorArgKinds,
        );

        const methodArgKinds = sanitizeSemanticValueKindsForValues(
            methodArgs,
            check.methodArgKinds,
        );

        const expectedKind = sanitizeSemanticValueKindForValue(
            check.expected,
            check.expectedKind,
        );

        const rawCalls = Array.isArray(check.calls) ? check.calls : [];
        const calls = rawCalls
            .filter((call): call is Record<string, unknown> => !!call && typeof call === "object")
            .map((call) => {
                const callMethodName = normalizeText(call.methodName);
                const callMethodArgs = Array.isArray(call.methodArgs)
                    ? call.methodArgs
                    : [];
                const callMethodArgKinds = sanitizeSemanticValueKindsForValues(
                    callMethodArgs,
                    call.methodArgKinds,
                );

                if (!callMethodName) return null;

                return {
                    methodName: callMethodName,
                    methodArgs: callMethodArgs,
                    ...(callMethodArgKinds ? { methodArgKinds: callMethodArgKinds } : {}),
                };
            })
            .filter((call): call is { methodName: string; methodArgs: unknown[]; methodArgKinds?: string[] } => !!call);

        return {
            type,
            className,
            constructorArgs,
            ...(constructorArgKinds ? { constructorArgKinds } : {}),
            ...(type === "method_sequence_returns" || type === "attribute_sequence_equals" ? { calls } : {}),
            ...(type === "attribute_sequence_equals" ? { attributeName } : {}),
            ...(type !== "attribute_sequence_equals" ? { methodName } : {}),
            ...(type !== "attribute_sequence_equals" ? { methodArgs } : {}),
            ...(type !== "attribute_sequence_equals" && methodArgKinds ? { methodArgKinds } : {}),
            expected: check.expected,
            ...(expectedKind ? { expectedKind } : {}),
            ...(message ? { message } : {}),
        };
    }

    if (type === "created_instances") {
        const className = normalizeText(check.className);
        const min = Number(check.min ?? 1);

        if (!className) return null;

        return {
            type,
            className,
            min: Number.isFinite(min) && min > 0 ? Math.floor(min) : 1,
            ...(message ? { message } : {}),
        };
    }
    if (type === "printed_line_count") {
        const expected = Number(check.expected);
        if (Number.isFinite(expected) && expected === 0) {
            return {
                type: "no_stdout",
                ...(message ? { message } : {}),
            };
        }

        const min = Number(check.min ?? 1);

        return {
            type,
            min: Number.isFinite(min) && min > 0 ? Math.floor(min) : 1,
            ...(message ? { message } : {}),
        };
    }

    return null;
}

function sanitizeSemanticCheckList(
    semanticChecks: unknown,
): Record<string, unknown>[] {
    if (!Array.isArray(semanticChecks)) return [];

    return semanticChecks
        .map(sanitizeSemanticCheck)
        .filter((check): check is Record<string, unknown> => !!check);
}

function fallbackObservableChoiceExercise(
    exercise: Record<string, unknown>,
): Record<string, unknown> {
    return {
        id: normalizeText(exercise.id) || "sanitized-code-input",
        kind: "fill_blank_choice",
        title: normalizeText(exercise.title) || "Make the code observable",
        prompt:
            normalizeText(exercise.prompt) ||
            "Choose the missing idea that makes this program checkable.",
        hint:
            normalizeText(exercise.hint) ||
            "A generated code exercise must produce an observable result.",
        help: isRecord(exercise.help)
            ? exercise.help
            : {
                concept:
                    "Programs used in fixed tests need visible output so their behavior can be checked.",
                hint_1:
                    "A file-writing program can print a confirmation or print the file contents after writing.",
                hint_2: "Avoid tests that expect no output.",
            },
        template:
            "A file-writing code exercise should also ____ so automated tests can check it.",
        choices: [
            "print an observable result",
            "hide all output",
            "delete the file immediately",
            "skip the program",
        ],
        correctValue: "print an observable result",
    };
}

function resolveRecipeType(args: {
    declaredRecipeType: string | undefined;
    hasTests: boolean;
    hasSemanticChecks: boolean;
}): string {
    const { declaredRecipeType, hasTests, hasSemanticChecks } = args;

    if (
        declaredRecipeType &&
        VALID_RECIPE_TYPES.has(declaredRecipeType) &&
        declaredRecipeType !== "semantic" &&
        declaredRecipeType !== "fixed_tests"
    ) {
        return declaredRecipeType;
    }

    if (declaredRecipeType === "semantic" && hasSemanticChecks) {
        return "semantic";
    }

    if (declaredRecipeType === "fixed_tests" && hasTests) {
        return "fixed_tests";
    }

    // Salvage mismatched AI output safely:
    // - semantic with no semanticChecks but valid tests becomes fixed_tests
    // - fixed_tests with no tests but valid semanticChecks becomes semantic
    // - invalid/missing recipe with semanticChecks becomes semantic
    // - invalid/missing recipe with tests becomes fixed_tests
    if (hasSemanticChecks) {
        return "semantic";
    }

    return "fixed_tests";
}

function sanitizeCodeInputExercise(
    exercise: Record<string, unknown>,
): Record<string, unknown> {
    const tests = Array.isArray(exercise.tests)
        ? exercise.tests
            .map(sanitizeTest)
            .filter((test): test is Record<string, unknown> => !!test)
        : [];

    const semanticChecks = sanitizeSemanticCheckList(exercise.semanticChecks);

    const hasTests = tests.length > 0;
    const hasSemanticChecks = semanticChecks.length > 0;
    const declaredRecipeType =
        typeof exercise.recipeType === "string"
            ? normalizeText(exercise.recipeType)
            : undefined;
    const recipeRunsWithoutAuthoredTests = declaredRecipeType === "sql_query";

    // SQL query recipes are graded from their result-table contract and do not
    // require fixed stdout tests or semantic checks. Do not replace a valid SQL
    // code_input with the Python file-output fallback exercise.
    if (!hasTests && !hasSemanticChecks && !recipeRunsWithoutAuthoredTests) {
        return fallbackObservableChoiceExercise(exercise);
    }

    const next: Record<string, unknown> = {
        ...exercise,
    };

    const fixtureFiles = sanitizeFixtureList(exercise.files);

    if (fixtureFiles) {
        next.files = fixtureFiles;
    } else {
        delete next.files;
    }

    ensureCodeInputRequiredCodeFields(next, fixtureFiles);

    const recipeType = resolveRecipeType({
        declaredRecipeType,
        hasTests,
        hasSemanticChecks,
    });

    next.recipeType = recipeType;

    if (recipeType === "semantic") {
        next.semanticChecks = semanticChecks;
        delete next.tests;
        return next;
    }

    if (recipeType === "fixed_tests") {
        next.tests = tests;
        delete next.semanticChecks;
        return next;
    }

    // Keep non-standard existing recipe types, but still sanitize what we can.
    if (hasTests) {
        next.tests = tests;
    } else {
        delete next.tests;
    }

    if (hasSemanticChecks) {
        next.semanticChecks = semanticChecks;
    } else {
        delete next.semanticChecks;
    }

    return next;
}

export function sanitizeGeneratedTopicAuthoringDraft(
    value: TopicAuthoringDraft,
): TopicAuthoringDraft {
    const quizDraft = Array.isArray(value.quizDraft)
        ? value.quizDraft.map((exercise) => {
            if (!isRecord(exercise)) return exercise;

            const kind = normalizeText(exercise.kind);

            if (kind === "code_input") {
                return sanitizeCodeInputExercise(exercise);
            }

            return sanitizeNonCodeExercise(exercise);
        })
        : value.quizDraft;

    return {
        ...value,
        quizDraft,
    } as TopicAuthoringDraft;
}