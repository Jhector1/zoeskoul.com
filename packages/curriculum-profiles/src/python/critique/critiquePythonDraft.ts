import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { CritiqueIssue, CritiqueReport } from "../../shared/profileServices.js";
import { makeEmptyCritiqueReport } from "../../shared/noopReports.js";
import { PYTHON_MINIMUM_FIXED_TESTS } from "../profile.js";

function hasInputCalls(source: string) {
    return /\binput\s*\(/.test(source);
}

function normalizeTestFiles(files: unknown): Array<{ path: string; content: string }> {
    if (!Array.isArray(files)) return [];

    return files
        .map((file) => {
            if (!file || typeof file !== "object") return null;

            const item = file as {
                path?: unknown;
                content?: unknown;
            };

            const path = String(item.path ?? "").trim();
            if (!path) return null;

            return {
                path,
                content: String(item.content ?? ""),
            };
        })
        .filter((file): file is { path: string; content: string } => Boolean(file))
        .sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeFixedTestKey(test: {
    stdin?: unknown;
    stdout?: unknown;
    match?: unknown;
    files?: unknown;
}) {
    return JSON.stringify({
        stdin: String(test.stdin ?? ""),
        stdout: String(test.stdout ?? ""),
        match: test.match === "includes" ? "includes" : "exact",
        files: normalizeTestFiles(test.files),
    });
}

function hasMinimumDistinctFixedTests(tests: Array<{
    stdin?: unknown;
    stdout?: unknown;
    match?: unknown;
    files?: unknown;
}>) {
    return new Set(tests.map(normalizeFixedTestKey)).size >= PYTHON_MINIMUM_FIXED_TESTS;
}

function hasFileFixtureTests(tests: Array<{ files?: unknown }>) {
    return tests.some((test) => normalizeTestFiles(test.files).length > 0);
}

function looksLikeOopOrMultifileStructureTask(exercise: {
    prompt?: unknown;
    starterCode?: unknown;
    solutionCode?: unknown;
    starterFiles?: unknown;
    solutionFiles?: unknown;
}) {
    const text = [exercise.prompt, exercise.starterCode, exercise.solutionCode]
        .map((value) => String(value ?? ""))
        .join("\n")
        .toLowerCase();

    const hasWorkspaceFiles =
        Array.isArray(exercise.starterFiles) || Array.isArray(exercise.solutionFiles);
    const solutionCode = String(exercise.solutionCode ?? "");

    return (
        /\bclass\s+[a-z_][a-z0-9_]*\b/i.test(solutionCode) ||
        /\bdef\s+__init__\b/.test(solutionCode) ||
        /\bself\./.test(solutionCode) ||
        /\b(inherits?|subclass|override|method|attribute|constructor|instance|object|import|helper module|models?\/|services?\/)\b/.test(text) ||
        (hasWorkspaceFiles && /\b(class|method|attribute|constructor|instance|object|import|helper|module)\b/.test(text))
    );
}


export async function critiquePythonDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<CritiqueReport> {
    const report = makeEmptyCritiqueReport(args.seed.topicId);
    const issues: CritiqueIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;
        if ((exercise.recipeType ?? "fixed_tests") !== "fixed_tests") continue;

        const tests = Array.isArray(exercise.tests) ? exercise.tests : [];

        if (hasMinimumDistinctFixedTests(tests)) continue;

        const combinedCode = `${String(exercise.starterCode ?? "")}\n${String(exercise.solutionCode ?? "")}`;
        const oopOrMultifileStructureTask = looksLikeOopOrMultifileStructureTask(exercise);

        const message = oopOrMultifileStructureTask
            ? `Exercise "${exercise.id}" is an OOP/multifile structure task but is still using fixed_tests with fewer than ${PYTHON_MINIMUM_FIXED_TESTS} meaningful validations. Switch it to recipeType "semantic", remove tests[], and add semanticChecks such as defines_class, constructible, instance_attributes, method_returns, created_instances, printed_line_count, or no_stdout.`
            : hasFileFixtureTests(tests)
                ? `Exercise "${exercise.id}" still has fewer than ${PYTHON_MINIMUM_FIXED_TESTS} meaningful file-fixture tests. Add distinct tests[].files contents and matching stdout cases, or switch to semantic checks if the task is about classes, methods, attributes, imports, or multifile structure rather than file input data.`
                : hasInputCalls(combinedCode)
                    ? `Exercise "${exercise.id}" still has fewer than ${PYTHON_MINIMUM_FIXED_TESTS} meaningful fixed tests. Add distinct stdin/stdout cases or replace the exercise.`
                    : `Exercise "${exercise.id}" is invalid as fixed_tests code_input because it has fewer than ${PYTHON_MINIMUM_FIXED_TESTS} meaningful validations. Replace it with a non-code exercise, regenerate it as stdin-based code_input, or switch it to semantic checks when the task is about functions, classes, objects, methods, attributes, or return values.`;

        issues.push({
            code: "PYTHON_FIXED_TEST_REPAIR_UNSAFE",
            category: "pedagogy",
            severity: "error",
            exerciseId: exercise.id,
            message,
        });
    }

    report.issues = issues;
    report.ok = issues.length < 1;
    return report;
}