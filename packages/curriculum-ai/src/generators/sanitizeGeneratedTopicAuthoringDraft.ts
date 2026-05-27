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
        const functionName = normalizeText(check.functionName);

        if (!functionName || !("expected" in check)) {
            return null;
        }

        return {
            type,
            functionName,
            args: Array.isArray(check.args) ? check.args : [],
            expected: check.expected,
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

    if (type === "method_returns") {
        const className = normalizeText(check.className);
        const methodName = normalizeText(check.methodName);

        if (!className || !methodName || !("expected" in check)) {
            return null;
        }

        return {
            type,
            className,
            constructorArgs: Array.isArray(check.constructorArgs)
                ? check.constructorArgs
                : [],
            methodName,
            methodArgs: Array.isArray(check.methodArgs)
                ? check.methodArgs
                : [],
            expected: check.expected,
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

    if (!hasTests && !hasSemanticChecks) {
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

    const declaredRecipeType =
        typeof next.recipeType === "string"
            ? normalizeText(next.recipeType)
            : undefined;

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

            if (exercise.kind === "code_input") {
                return sanitizeCodeInputExercise(exercise);
            }

            return exercise;
        })
        : value.quizDraft;

    return {
        ...value,
        quizDraft,
    } as TopicAuthoringDraft;
}