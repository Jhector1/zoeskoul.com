import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    getDraftCatalogRoot,
    getDraftMessagesRoot,
    getRepoRoot,
} from "@zoeskoul/curriculum-core";
import { getProfileServices } from "@zoeskoul/curriculum-profiles";

type JsonObject = Record<string, any>;

type GoldenRow = {
    status: "PASS" | "FAIL";
    topicId: string;
    exerciseId: string;
    code?: string;
    message?: string;
    file?: string;
};

const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;

const repoRoot = getRepoRoot();

function loadEnvFile(filePath: string) {
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) continue;

        const [, key, rawValue] = match;

        if (process.env[key] != null) continue;

        let value = rawValue.trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        process.env[key] = value;
    }
}

for (const relativePath of [
    ".env",
    ".env.local",
    "apps/web/.env.local",
    "apps/runner/.env.local",
]) {
    loadEnvFile(path.join(repoRoot, relativePath));
}

const draftCourseSlug =
    process.env.DRAFT_COURSE_SLUG ?? "python-data-functions";

const runDraftCodeInputGoldens =
    process.env.RUN_DRAFT_CODE_INPUT_GOLDENS === "1";
const draftCodeInputGoldenIt = runDraftCodeInputGoldens ? it : it.skip;

function readJson(filePath: string): JsonObject {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function findTopicBundlePaths(subjectRoot: string): string[] {
    const result: string[] = [];

    function walk(dir: string) {
        if (!fs.existsSync(dir)) return;

        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }

            if (entry.isFile() && entry.name === "topic.bundle.json") {
                result.push(fullPath);
            }
        }
    }

    walk(subjectRoot);

    return result.sort();
}

function findDraftSubjectRoots(): string[] {
    const draftsRoot = path.join(repoRoot, ".curriculum-drafts");
    if (!fs.existsSync(draftsRoot)) return [];

    const subjectRoots: string[] = [];

    for (const catalogEntry of fs.readdirSync(draftsRoot, { withFileTypes: true })) {
        if (!catalogEntry.isDirectory()) continue;

        const catalogSubjectsRoot = path.join(draftsRoot, catalogEntry.name, "subjects");
        if (!fs.existsSync(catalogSubjectsRoot)) continue;

        for (const subjectEntry of fs.readdirSync(catalogSubjectsRoot, { withFileTypes: true })) {
            if (!subjectEntry.isDirectory()) continue;
            const subjectRoot = path.join(catalogSubjectsRoot, subjectEntry.name);
            if (findTopicBundlePaths(subjectRoot).length > 0) {
                subjectRoots.push(subjectRoot);
            }
        }
    }

    return subjectRoots.sort();
}

function normalizeDraftSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/--draft$/, "")
        .replace(/^python--/, "")
        .replace(/--/g, "-");
}

function matchesExplicitDraftSlug(
    subjectRoot: string,
    explicitSlug: string,
): boolean {
    const folderName = path.basename(subjectRoot);

    if (
        folderName === explicitSlug ||
        normalizeDraftSlug(folderName) === normalizeDraftSlug(explicitSlug)
    ) {
        return true;
    }

    return findTopicBundlePaths(subjectRoot).some((bundlePath) => {
        try {
            const bundle = readJson(bundlePath);
            const candidateValues = [
                bundle.subjectSlug,
                bundle.courseSlug,
                bundle.topicId,
            ].filter((value): value is string => typeof value === "string");

            return candidateValues.some(
                (value) =>
                    value === explicitSlug ||
                    normalizeDraftSlug(value) === normalizeDraftSlug(explicitSlug),
            );
        } catch {
            return false;
        }
    });
}

function resolveDraftSubjectRoot(): string {
    const explicitRoot = process.env.DRAFT_SUBJECT_ROOT;

    if (explicitRoot) {
        const resolved = path.isAbsolute(explicitRoot)
            ? explicitRoot
            : path.join(repoRoot, explicitRoot);

        const bundles = findTopicBundlePaths(resolved);

        if (bundles.length === 0) {
            throw new Error(
                [
                    `DRAFT_SUBJECT_ROOT was provided, but no topic.bundle.json files were found there:`,
                    `  ${resolved}`,
                ].join("\n"),
            );
        }

        return resolved;
    }

    const explicitSlug = process.env.DRAFT_SUBJECT_SLUG;

    if (explicitSlug) {
        const matchingRoots = findDraftSubjectRoots().filter((subjectRoot) =>
            matchesExplicitDraftSlug(subjectRoot, explicitSlug),
        );

        if (matchingRoots.length === 1) {
            return matchingRoots[0];
        }

        if (matchingRoots.length > 1) {
            throw new Error(
                [
                    `DRAFT_SUBJECT_SLUG=${explicitSlug} matched more than one draft subject root:`,
                    ...matchingRoots.map(
                        (root) => `  ${path.relative(repoRoot, root)}`,
                    ),
                ].join("\n"),
            );
        }

        throw new Error(
            [
                `DRAFT_SUBJECT_SLUG=${explicitSlug} was provided, but no matching draft subject root with topic.bundle.json files was found.`,
                "",
                "Available draft subject roots:",
                ...findDraftSubjectRoots().map((root) =>
                    `  ${path.relative(repoRoot, root)}`,
                ),
            ].join("\n"),
        );
    }

    const roots = findDraftSubjectRoots();

    const matching = roots.filter((root) => {
        const folderName = path.basename(root);

        if (folderName.includes(draftCourseSlug)) {
            return true;
        }

        return findTopicBundlePaths(root).some((bundlePath) => {
            try {
                const bundle = readJson(bundlePath);

                return (
                    bundle.courseSlug === draftCourseSlug ||
                    bundle.subjectSlug === draftCourseSlug ||
                    JSON.stringify(bundle).includes(draftCourseSlug)
                );
            } catch {
                return false;
            }
        });
    });

    const candidates = matching.length > 0 ? matching : roots;

    if (candidates.length !== 1) {
        throw new Error(
            [
                "Could not choose one draft subject root automatically.",
                `DRAFT_COURSE_SLUG=${draftCourseSlug}`,
                "",
                "Candidate draft subject roots:",
                ...candidates.map((root) => `  ${path.relative(repoRoot, root)}`),
                "",
                "Run again with one explicit folder:",
                "  DRAFT_SUBJECT_SLUG=python--python-data-functions--draft pnpm --filter @zoeskoul/curriculum-compiler exec vitest run --root ../.. packages/curriculum-compiler/src/validate/draftSubjectCodeInputGoldens.test.ts",
            ].join("\n"),
        );
    }

    return candidates[0];
}

function resolveDraftProfileId(subjectRoot: string): string {
    const manifestPath = path.join(subjectRoot, "subject.manifest.json");

    if (fs.existsSync(manifestPath)) {
        const manifest = readJson(manifestPath);
        const manifestProfileId = manifest?.subject?.profileId;

        if (
            typeof manifestProfileId === "string" &&
            manifestProfileId.trim().length > 0
        ) {
            return manifestProfileId;
        }
    }

    for (const bundlePath of findTopicBundlePaths(subjectRoot)) {
        try {
            const bundle = readJson(bundlePath);
            const bundleProfileId = bundle?.profileId;

            if (
                typeof bundleProfileId === "string" &&
                bundleProfileId.trim().length > 0
            ) {
                return bundleProfileId;
            }
        } catch {
            // Ignore malformed bundle JSON here; the main test reports it later.
        }
    }

    throw new Error(
        `Could not resolve a profileId for draft subject root ${path.relative(repoRoot, subjectRoot)}.`,
    );
}

function inferModuleDir(bundlePath: string, subjectRoot: string): string {
    const relative = path.relative(subjectRoot, bundlePath);
    const parts = relative.split(path.sep);
    const modulesIndex = parts.indexOf("modules");

    if (modulesIndex >= 0 && parts[modulesIndex + 1]) {
        return parts[modulesIndex + 1];
    }

    return "module1";
}

function inferModuleOrder(moduleDir: string): number {
    const parsed = Number(moduleDir.replace(/^module/, ""));

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getTopicId(bundle: JsonObject, bundlePath: string): string {
    if (typeof bundle.topicId === "string" && bundle.topicId.trim()) {
        return bundle.topicId;
    }

    return path.basename(path.dirname(bundlePath));
}

function getCodeInputExercises(bundle: JsonObject): JsonObject[] {
    if (!Array.isArray(bundle.exercises)) {
        return [];
    }

    return bundle.exercises.filter(
        (exercise) => exercise && exercise.kind === "code_input",
    );
}

const bannedTryPhrases = [
    "lesson idea",
    "small runnable program",
    "small job",
    "scenario needs",
    "fits the scenario",
    "This Try it yourself checkpoint",
    "mirrors the helper",
    "the way a multi-file project will",
];

const multiFileTryTopics = new Set([
    "using-imports-and-helper-files",
    "module-6-name-badge-package",
]);

function collectTryExerciseTexts(messages: JsonObject): Array<{ id: string; text: string }> {
    const subjectKey = Object.keys(messages.topics ?? {})[0];
    const moduleKey = Object.keys(messages.topics?.[subjectKey] ?? {})[0];
    const topicKey = Object.keys(messages.topics?.[subjectKey]?.[moduleKey] ?? {})[0];
    const quiz = messages.topics?.[subjectKey]?.[moduleKey]?.[topicKey]?.quiz ?? {};
    const tryIt = messages.topics?.[subjectKey]?.[moduleKey]?.[topicKey]?.tryIt ?? {};
    const rows: Array<{ id: string; text: string }> = [];

    for (const [id, entry] of Object.entries(quiz)) {
        if (!id.startsWith("try-")) continue;
        rows.push({ id, text: JSON.stringify(entry) });
    }

    for (const [id, entry] of Object.entries(tryIt)) {
        if (id === "allowReveal") continue;
        rows.push({ id, text: JSON.stringify(entry) });
    }

    return rows;
}

function getRequiredFiles(exercise: JsonObject): string[] {
    const top = Array.isArray(exercise.workspaceExpectations?.requiredFiles)
        ? exercise.workspaceExpectations.requiredFiles
        : [];
    const nested = Array.isArray(exercise.workspace?.workspaceExpectations?.requiredFiles)
        ? exercise.workspace.workspaceExpectations.requiredFiles
        : [];

    return top.length > 0 ? top : nested;
}

function getStarterAndWorkspacePaths(exercise: JsonObject): Set<string> {
    const paths = new Set<string>();

    for (const file of [
        ...(exercise.starterFiles ?? []),
        ...(exercise.workspace?.starterFiles ?? []),
        ...(exercise.workspace?.files ?? []),
    ]) {
        if (file && typeof file.path === "string") {
            paths.add(file.path);
        }
    }

    return paths;
}

function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writesRequiredFileAtRuntime(exercise: JsonObject, filePath: string): boolean {
    const source = [
        String(exercise.recipe?.solutionCode ?? ""),
        ...(exercise.recipe?.solutionFiles ?? []).map((file: JsonObject) =>
            typeof file.content === "string" ? file.content : "",
        ),
    ].join("\n");

    const escaped = escapeForRegExp(filePath);
    const openWritePattern = new RegExp(
        `open\\(\\s*["']${escaped}["']\\s*,\\s*["'][wa]["']`,
    );
    const mkdirPattern = new RegExp(
        `Path\\(\\s*["']${escaped}["']\\s*\\)\\.mkdir`,
    );

    return openWritePattern.test(source) || mkdirPattern.test(source);
}

function printResults(rows: GoldenRow[]) {
    const passed = rows.filter((row) => row.status === "PASS");
    const failed = rows.filter((row) => row.status === "FAIL");

    console.log("");
    console.log(yellow("Draft code_input golden results"));
    console.log(yellow("================================"));

    for (const row of rows) {
        if (row.status === "PASS") {
            console.log(`${green("PASS")} ${row.topicId}/${row.exerciseId}`);
            continue;
        }

        console.log(
            `${red("FAIL")} ${row.topicId}/${row.exerciseId} ${gray(row.code ?? "")}`,
        );

        if (row.message) {
            console.log(`     ${row.message}`);
        }

        if (row.file) {
            console.log(`     ${gray(row.file)}`);
        }
    }

    console.log("");
    console.log(`${green(`${passed.length} passed`)} | ${red(`${failed.length} failed`)}`);
    console.log("");
}

describe("draft subject code_input goldens", () => {
    it("keeps Python Data and Functions try-it-yourself copy and multi-file/file rules aligned", () => {
        const subjectRoot = resolveDraftSubjectRoot();
        const messageRoot = path.join(
            getDraftMessagesRoot(path.basename(subjectRoot)),
            "en",
            "subjects",
            path.basename(subjectRoot),
        );
        const issues: string[] = [];

        for (const bundlePath of findTopicBundlePaths(subjectRoot)) {
            const bundle = readJson(bundlePath);
            const topicId = getTopicId(bundle, bundlePath);
            const moduleDir = inferModuleDir(bundlePath, subjectRoot);
            const messagePath = path.join(messageRoot, moduleDir, `${topicId}.json`);

            if (fs.existsSync(messagePath)) {
                const messages = readJson(messagePath);

                for (const row of collectTryExerciseTexts(messages)) {
                    for (const phrase of bannedTryPhrases) {
                        if (row.text.includes(phrase)) {
                            issues.push(
                                `${topicId}/${row.id} contains banned phrase: ${phrase}`,
                            );
                        }
                    }
                }
            }

            for (const exercise of getCodeInputExercises(bundle)) {
                const exerciseId = String(exercise.id ?? "(missing-id)");
                const requiredFiles = getRequiredFiles(exercise);
                const existingPaths = getStarterAndWorkspacePaths(exercise);

                if (multiFileTryTopics.has(topicId) && exerciseId.startsWith("try-")) {
                    const helperFiles = requiredFiles.filter(
                        (filePath) =>
                            filePath.endsWith(".py") && filePath !== "main.py",
                    );
                    if (helperFiles.length < 1) {
                        issues.push(
                            `${topicId}/${exerciseId} should require at least one helper file outside main.py`,
                        );
                    }

                    const sourceChecks = [
                        ...(exercise.sourceChecks ?? []),
                        ...(exercise.recipe?.sourceChecks ?? []),
                    ];
                    const hasImportCheck = sourceChecks.some(
                        (check: JsonObject) =>
                            check?.type === "uses_import" ||
                            (typeof check?.path === "string" &&
                                check.path !== "main.py"),
                    );

                    if (!hasImportCheck) {
                        issues.push(
                            `${topicId}/${exerciseId} should validate import or helper-module usage`,
                        );
                    }
                }

                for (const filePath of requiredFiles) {
                    if (existingPaths.has(filePath)) continue;
                    if (!writesRequiredFileAtRuntime(exercise, filePath)) continue;

                    issues.push(
                        `${topicId}/${exerciseId} requiredFiles contains output file ${filePath}; browser will fail before runtime.`,
                    );
                }
            }
        }

        expect(issues).toEqual([]);
    });

    draftCodeInputGoldenIt("runs every generated draft code_input solution against its own contract", async () => {
        const subjectRoot = resolveDraftSubjectRoot();
        const subjectFolderName = path.basename(subjectRoot);
        const profileId = resolveDraftProfileId(subjectRoot);
        const bundlePaths = findTopicBundlePaths(subjectRoot);

        const rows: GoldenRow[] = [];
        let codeInputCount = 0;

        const services = getProfileServices(profileId);

        for (const bundlePath of bundlePaths) {
            const relativeBundlePath = path.relative(repoRoot, bundlePath);

            let bundle: JsonObject;

            try {
                bundle = readJson(bundlePath);
            } catch (error) {
                rows.push({
                    status: "FAIL",
                    topicId: path.basename(path.dirname(bundlePath)),
                    exerciseId: "(bundle)",
                    code: "INVALID_TOPIC_BUNDLE_JSON",
                    message: error instanceof Error ? error.message : String(error),
                    file: relativeBundlePath,
                });
                continue;
            }

            const topicId = getTopicId(bundle, bundlePath);
            const moduleDir = inferModuleDir(bundlePath, subjectRoot);
            const moduleOrder = inferModuleOrder(moduleDir);
            const codeInputExercises = getCodeInputExercises(bundle);

            codeInputCount += codeInputExercises.length;

            if (codeInputExercises.length === 0) {
                continue;
            }

            let report: any;

            try {
                report = await services.validateGolden({
                    seed: {
                        profileId,
                        subjectSlug:
                            typeof bundle.subjectSlug === "string"
                                ? bundle.subjectSlug
                                : subjectFolderName,
                        courseSlug: draftCourseSlug,
                        topicId,
                        moduleSlug:
                            typeof bundle.moduleSlug === "string"
                                ? bundle.moduleSlug
                                : moduleDir,
                        sectionSlug:
                            typeof bundle.sectionSlug === "string"
                                ? bundle.sectionSlug
                                : "unknown-section",
                        order: 1,
                        title:
                            typeof bundle.topic?.label === "string"
                                ? bundle.topic.label
                                : topicId,
                        summary:
                            typeof bundle.topic?.summary === "string"
                                ? bundle.topic.summary
                                : "",
                        minutes:
                            typeof bundle.minutes === "number"
                                ? bundle.minutes
                                : 15,
                        moduleTitle:
                            typeof bundle.moduleTitle === "string"
                                ? bundle.moduleTitle
                                : moduleDir,
                        moduleObjectives: [],
                        guidedExercises: [],
                        quizFocus: [],
                        sectionTitle: "Section",
                        sourceLocale: "en",
                        targetLocales: [],
                        modulePrefix:
                            typeof bundle.moduleSlug === "string"
                                ? bundle.moduleSlug
                                : moduleDir,
                        moduleOrder,
                        sectionOrder: 1,
                        learningGoals: [],
                        moduleRuntimeDefaults:
                            bundle.runtimeDefaults &&
                            typeof bundle.runtimeDefaults === "object"
                                ? bundle.runtimeDefaults
                                : null,
                    } as any,
                    draft: {} as any,
                    topicBundle: bundle as any,
                });
            } catch (error) {
                for (const exercise of codeInputExercises) {
                    rows.push({
                        status: "FAIL",
                        topicId,
                        exerciseId: String(exercise.id ?? "(missing-id)"),
                        code: "VALIDATE_GOLDEN_THROWN",
                        message:
                            error instanceof Error ? error.message : String(error),
                        file: relativeBundlePath,
                    });
                }

                continue;
            }

            const failedExerciseIds = new Set<string>();
            const topicLevelIssues: any[] = [];

            for (const issue of report?.issues ?? []) {
                const exerciseId =
                    typeof issue.exerciseId === "string" && issue.exerciseId.trim()
                        ? issue.exerciseId
                        : "(topic)";

                if (exerciseId === "(topic)") {
                    topicLevelIssues.push(issue);
                } else {
                    failedExerciseIds.add(exerciseId);
                }

                rows.push({
                    status: "FAIL",
                    topicId,
                    exerciseId,
                    code: issue.code,
                    message: issue.message,
                    file: relativeBundlePath,
                });
            }

            if (topicLevelIssues.length > 0) {
                continue;
            }

            for (const exercise of codeInputExercises) {
                const exerciseId = String(exercise.id ?? "(missing-id)");

                if (failedExerciseIds.has(exerciseId)) {
                    continue;
                }

                rows.push({
                    status: "PASS",
                    topicId,
                    exerciseId,
                    file: relativeBundlePath,
                });
            }
        }

        expect(bundlePaths.length).toBeGreaterThan(0);
        expect(codeInputCount).toBeGreaterThan(0);

        rows.sort((a, b) => {
            const topicCompare = a.topicId.localeCompare(b.topicId);
            if (topicCompare !== 0) return topicCompare;

            if (a.status !== b.status) {
                return a.status === "FAIL" ? -1 : 1;
            }

            return a.exerciseId.localeCompare(b.exerciseId);
        });

        printResults(rows);

        const failed = rows.filter((row) => row.status === "FAIL");
        const passed = rows.filter((row) => row.status === "PASS");

        if (failed.length > 0) {
            throw new Error(
                `Draft code_input goldens failed: ${failed.length} failed, ${passed.length} passed.`,
            );
        }
    }, 900_000);
});
