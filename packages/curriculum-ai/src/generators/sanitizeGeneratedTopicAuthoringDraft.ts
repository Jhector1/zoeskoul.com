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
        path.split("/").some((segment) => !segment || segment === "." || segment === "..")
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
        const candidate = limited.length > 0
            ? `${limited.join("\n")}\n${line}`
            : line;
        if (candidate.length > PYTHON_MAX_FIXTURE_CONTENT_LENGTH) break;
        limited.push(line);
    }

    return limited.length > 0
        ? limited.join("\n")
        : trimmed.slice(0, PYTHON_MAX_FIXTURE_CONTENT_LENGTH).trimEnd();
}

function sanitizeFixtureList(files: unknown): Record<string, unknown>[] | undefined {
    if (!Array.isArray(files)) return undefined;

    const seen = new Set<string>();
    const sanitized = files
        .filter(isRecord)
        .map((file) => {
            const path = normalizeText(file.path);
            if (isInvalidFixturePath(path) || seen.has(path)) return null;
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
        ...test,
        stdout,
    };

    delete next.output;

    if (typeof test.stdin === "string") {
        next.stdin = test.stdin;
    } else if (typeof test.input === "string") {
        next.stdin = test.input;
    } else {
        delete next.stdin;
    }

    if (VALID_MATCH_TYPES.has(String(test.match))) {
        next.match = test.match;
    } else {
        delete next.match;
    }

    const files = sanitizeFixtureList(test.files);
    if (files) {
        next.files = files;
    } else {
        delete next.files;
    }

    return next;
}

function sanitizeCodeInputExercise(
    exercise: Record<string, unknown>,
): Record<string, unknown> {
    const tests = Array.isArray(exercise.tests)
        ? exercise.tests
            .map(sanitizeTest)
            .filter((test): test is Record<string, unknown> => !!test)
        : [];

    const semanticChecks = Array.isArray(exercise.semanticChecks)
        ? exercise.semanticChecks
        : [];

    const hasTests = tests.length > 0;
    const hasSemanticChecks = semanticChecks.length > 0;

    if (!hasTests && !hasSemanticChecks) {
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
                    hint_2:
                        "Avoid tests that expect no output.",
                },
            template:

        "A file-writing code exercise should also ____ so automated tests can check it.",            choices: [
                "print an observable result",
                "hide all output",
                "delete the file immediately",
                "skip the program",
            ],
            correctValue: "print an observable result",
        };
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

    const recipeType =
        typeof next.recipeType === "string" ? next.recipeType : undefined;

    if (!recipeType || !VALID_RECIPE_TYPES.has(recipeType)) {
        delete next.recipeType;
        return next;
    }

    if (recipeType === "fixed_tests" && !hasTests) {
        delete next.recipeType;
    }

    if (recipeType === "semantic" && !hasSemanticChecks) {
        delete next.recipeType;
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
