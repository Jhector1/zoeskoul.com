import type {
    ManifestCodeInput,
    ManifestFileFixture,
    ManifestStarterFiles,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    makeEmptyGoldenValidationReport,
} from "../shared/noopReports.js";
import type { GoldenValidationReport } from "../shared/profileServices.js";
import { validateCodeProfileGolden } from "../shared/validateCodeProfileGolden.js";
import { validateGoldenTopicBundle } from "../shared/validateGoldenTopicBundle.js";

const PYTHON_MAX_FIXTURE_PATH_LENGTH = 120;
const PYTHON_MAX_FIXTURE_CONTENT_LENGTH = 600;
const PYTHON_MAX_CONSECUTIVE_BLANK_LINES = 3;

function normalizeWorkspaceFiles(
    files: ManifestStarterFiles | undefined,
): Array<{ path: string; content: string }> {
    if (!files) return [];

    if (Array.isArray(files)) {
        return files
            .map((file) => {
                if (typeof file === "string") return null;
                const path = typeof file.path === "string" ? file.path.trim() : "";
                if (!path) return null;
                return { path, content: String(file.content ?? "") };
            })
            .filter((file): file is { path: string; content: string } => Boolean(file));
    }

    return Object.entries(files).map(([path, value]) => ({
        path,
        content: typeof value === "string" ? value : String(value?.content ?? ""),
    }));
}

function collectFixturePaths(exercise: ManifestCodeInput): Set<string> {
    const files = [
        exercise.workspace?.files,
        exercise.workspace?.initialFiles,
        exercise.workspace?.workspaceFiles,
    ];
    const paths = new Set<string>();

    for (const source of files) {
        for (const file of normalizeWorkspaceFiles(source)) {
            paths.add(file.path);
        }
    }

    return paths;
}

function normalizeFixtureFiles(
    files: ManifestFileFixture[] | undefined,
): Array<{ path: string; content: string }> {
    if (!Array.isArray(files)) return [];

    return files
        .map((file) => {
            const path = typeof file.path === "string" ? file.path.trim() : "";
            if (!path) return null;
            return {
                path,
                content: String(file.content ?? ""),
            };
        })
        .filter((file): file is { path: string; content: string } => Boolean(file));
}

function isUnsafeFixturePath(path: string): boolean {
    return (
        !path ||
        path.length > PYTHON_MAX_FIXTURE_PATH_LENGTH ||
        path.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(path) ||
        path.split(/[\\/]+/).some((segment) => segment === "..")
    );
}

function fixtureContentLooksTooLarge(content: string): boolean {
    return content.length > PYTHON_MAX_FIXTURE_CONTENT_LENGTH;
}

function hasTooManyBlankLines(content: string): boolean {
    let blankRun = 0;

    for (const line of content.split("\n")) {
        if (line.trim().length === 0) {
            blankRun += 1;
            if (blankRun > PYTHON_MAX_CONSECUTIVE_BLANK_LINES) {
                return true;
            }
            continue;
        }

        blankRun = 0;
    }

    return false;
}

function collectTestFixturePaths(exercise: ManifestCodeInput): Array<Set<string>> {
    if (exercise.recipe.type !== "fixed_tests") return [];

    return exercise.recipe.tests.map((test) =>
        new Set(normalizeFixtureFiles(test.files).map((file) => file.path)),
    );
}

function hasMeaningfulStdinVariation(exercise: ManifestCodeInput): boolean {
    if (exercise.recipe.type !== "fixed_tests") return false;

    const distinct = new Set(
        exercise.recipe.tests
            .map((test) => String(test.stdin ?? ""))
            .filter((stdin) => stdin.trim().length > 0),
    );

    return distinct.size > 1;
}

function hasPerTestFixtureVariation(exercise: ManifestCodeInput): boolean {
    if (exercise.recipe.type !== "fixed_tests") return false;

    const signatures = new Set(
        exercise.recipe.tests.map((test) =>
            JSON.stringify(
                normalizeFixtureFiles(test.files)
                    .map((file) => ({ path: file.path, content: file.content }))
                    .sort((left, right) => left.path.localeCompare(right.path)),
            ),
        ),
    );

    return signatures.size > 1;
}

function usesFilesystem(source: string): boolean {
    return (
        /\bopen\s*\(/.test(source) ||
        /\bpathlib\b/.test(source) ||
        /\bPath\s*\(/.test(source) ||
        /\.read_text\s*\(/.test(source) ||
        /\.write_text\s*\(/.test(source)
    );
}

function referencedReadFiles(source: string): string[] {
    const paths = new Set<string>();
    const pathVariables = new Map<string, string>();
    const openPattern =
        /open\s*\(\s*["'`]([^"'`]+)["'`]\s*(?:,\s*["'`]([^"'`]*)["'`])?/g;
    const pathAssignmentPattern =
        /\b([A-Za-z_]\w*)\s*=\s*Path\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    const pathOpenPattern =
        /\bPath\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*open\s*\(\s*(?:["'`]([^"'`]*)["'`])?/g;
    const variableOpenPattern =
        /\b([A-Za-z_]\w*)\s*\.\s*open\s*\(\s*(?:["'`]([^"'`]*)["'`])?/g;
    const readTextPattern = /Path\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\.read_text\s*\(/g;

    for (const match of source.matchAll(pathAssignmentPattern)) {
        const variableName = match[1]?.trim();
        const filePath = match[2]?.trim();
        if (!variableName || !filePath) continue;
        pathVariables.set(variableName, filePath);
    }

    for (const match of source.matchAll(openPattern)) {
        if ((match.index ?? 0) > 0 && source[(match.index ?? 0) - 1] === ".") continue;
        const filePath = match[1]?.trim();
        const mode = (match[2] ?? "r").trim();
        if (!filePath) continue;
        if (mode.includes("w") || mode.includes("a") || mode.includes("x")) continue;
        paths.add(filePath);
    }

    for (const match of source.matchAll(pathOpenPattern)) {
        const filePath = match[1]?.trim();
        const mode = (match[2] ?? "r").trim();
        if (!filePath) continue;
        if (mode.includes("w") || mode.includes("a") || mode.includes("x")) continue;
        paths.add(filePath);
    }

    for (const match of source.matchAll(variableOpenPattern)) {
        const variableName = match[1]?.trim();
        const mode = (match[2] ?? "r").trim();
        if (!variableName) continue;
        if (mode.includes("w") || mode.includes("a") || mode.includes("x")) continue;
        const filePath = pathVariables.get(variableName);
        if (filePath) {
            paths.add(filePath);
        }
    }

    for (const match of source.matchAll(readTextPattern)) {
        const filePath = match[1]?.trim();
        if (filePath) {
            paths.add(filePath);
        }
    }

    return [...paths];
}

function extractSolutionCode(exercise: ManifestCodeInput): string {
    switch (exercise.recipe.type) {
        case "fixed_tests":
        case "sql_query":
        case "semantic":
            return String(exercise.recipe.solutionCode ?? "");
        case "template_io":
            return String(exercise.recipe.solutionTemplate ?? "");
    }
}

export async function validatePythonGolden(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    topicBundle: TopicBundleManifest;
}): Promise<GoldenValidationReport> {
    const shared = await validateGoldenTopicBundle(args);
    const report = makeEmptyGoldenValidationReport(args.seed.topicId);
    const supportsFilesystem =
        args.topicBundle.runtimeDefaults?.kind === "code" &&
        args.topicBundle.runtimeDefaults.supportsFileSystem === true;
    const blockedExerciseIds = new Set<string>();

    for (const exercise of args.topicBundle.exercises) {
        if (exercise.kind !== "code_input" || exercise.language !== "python") continue;

        const code = extractSolutionCode(exercise);
        const fileAccess = usesFilesystem(code);
        if (!fileAccess) continue;

        if (!supportsFilesystem) {
            blockedExerciseIds.add(exercise.id);
            report.issues.push({
                code: "PYTHON_FILESYSTEM_RUNTIME_REQUIRED",
                category: "runtime",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" uses Python file-system access, but this topic runtime does not support files. Regenerate it as a non-file exercise or move it into a file-enabled workspace.`,
            });
            continue;
        }

        const fixturePaths = collectFixturePaths(exercise);
        const perTestFixturePaths = collectTestFixturePaths(exercise);
        const missingPaths = referencedReadFiles(code).filter((filePath) => !fixturePaths.has(filePath));
        const invalidFixtures = [
            ...normalizeWorkspaceFiles(exercise.workspace?.files),
            ...normalizeWorkspaceFiles(exercise.workspace?.initialFiles),
            ...normalizeWorkspaceFiles(exercise.workspace?.workspaceFiles),
            ...(exercise.recipe.type === "fixed_tests"
                ? exercise.recipe.tests.flatMap((test) => normalizeFixtureFiles(test.files))
                : []),
        ].filter((file) => (
            isUnsafeFixturePath(file.path) ||
            fixtureContentLooksTooLarge(file.content) ||
            hasTooManyBlankLines(file.content)
        ));

        if (invalidFixtures.length > 0) {
            blockedExerciseIds.add(exercise.id);
            report.issues.push({
                code: "PYTHON_FILE_FIXTURE_INVALID",
                category: "runtime",
                severity: "error",
                exerciseId: exercise.id,
                message:
                    `Exercise "${exercise.id}" has invalid file fixtures. Keep fixture paths relative and short, and keep fixture contents short without long blank-line runs.`,
            });
            continue;
        }

        if (exercise.recipe.type === "fixed_tests") {
            const distinctStdout = new Set(
                exercise.recipe.tests.map((test) => String(test.stdout ?? "")),
            );

            if (
                distinctStdout.size > 1 &&
                !hasMeaningfulStdinVariation(exercise) &&
                !hasPerTestFixtureVariation(exercise)
            ) {
                blockedExerciseIds.add(exercise.id);
                report.issues.push({
                    code: "PYTHON_FILE_TESTS_NEED_PER_TEST_FIXTURES",
                    category: "runtime",
                    severity: "error",
                    exerciseId: exercise.id,
                    message:
                        `Exercise "${exercise.id}" has different expected stdout across file-based fixed tests, but it does not provide per-test file fixtures. Add tests[].files that match each expected output.`,
                });
                continue;
            }
        }

        if (missingPaths.length > 0) {
            const unresolvedPaths = missingPaths.filter((filePath) => (
                perTestFixturePaths.length < 1 ||
                perTestFixturePaths.some((paths) => !paths.has(filePath))
            ));

            if (unresolvedPaths.length > 0) {
                blockedExerciseIds.add(exercise.id);
                report.issues.push({
                    code: "PYTHON_FILE_FIXTURE_MISSING",
                    category: "runtime",
                    severity: "error",
                    exerciseId: exercise.id,
                    message:
                        `Exercise "${exercise.id}" reads ${unresolvedPaths.join(", ")} but does not provide matching fixture files for golden validation.`,
                });
                continue;
            }
        }

    }

    const codeGolden = await validateCodeProfileGolden({
        profileId: "python",
        expectedLanguage: "python",
        allowedRecipeTypes: ["fixed_tests", "template_io", "semantic"],
        topicBundle: {
            ...args.topicBundle,
            exercises: args.topicBundle.exercises.filter(
                (exercise) => !blockedExerciseIds.has(exercise.id),
            ),
        },
    });

    report.issues.push(...shared.issues);
    report.issues.push(...codeGolden);

    report.ok = !report.issues.some((issue) => issue.severity === "error");
    return report;
}
