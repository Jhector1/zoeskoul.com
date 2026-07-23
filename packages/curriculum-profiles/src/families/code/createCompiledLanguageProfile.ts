import type {
    ManifestCodeInput,
    ManifestFileFixture,
    ManifestStarterFile,
    ProgrammingCodeInputStarterFileDraft,
    ProgrammingCodeInputTestDraft,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";
import { normalizeWorkspacePath } from "@zoeskoul/curriculum-contracts";
import type {
    CodeInputHelpFallback,
    CodeInputProfileCapability,
    CourseProfile,
} from "../../types.js";
import type { SubjectShapePack } from "../../shapes/types.js";
import {
    messageTag,
    semanticCheckMessageTag,
    solutionFileContentMessageTag,
    starterFileContentMessageTag,
} from "../../shared/messageTags.js";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizePath(path: string, label: string): string {
    try {
        return normalizeWorkspacePath(path);
    } catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`);
    }
}

function normalizeStarterFiles(
    files: ProgrammingCodeInputStarterFileDraft[] | undefined,
    language: WorkspaceLanguage,
): ManifestStarterFile[] {
    if (!Array.isArray(files)) return [];

    const seen = new Set<string>();
    const normalized: ManifestStarterFile[] = [];

    for (const file of files) {
        const path = normalizePath(file.path, "Invalid compiled-language workspace path");
        if (seen.has(path)) continue;
        seen.add(path);
        normalized.push({
            ...file,
            path,
            content: String(file.content ?? ""),
            language: file.language ?? language,
        });
    }

    return normalized;
}

function normalizeFixtureFiles(files: ManifestFileFixture[] | undefined) {
    if (!Array.isArray(files)) return [];
    return files
        .filter((file) => normalizeText(file.path))
        .map((file) => ({
            ...file,
            path: normalizePath(file.path, "Invalid compiled-language fixture path"),
            content: String(file.content ?? ""),
        }));
}

function requireTests(
    tests: ProgrammingCodeInputTestDraft[] | undefined,
    exerciseId: string,
) {
    const normalized = Array.isArray(tests)
        ? tests
            .map((test) => ({
                ...(typeof test.stdin === "string" ? { stdin: test.stdin } : {}),
                stdout: String(test.stdout ?? ""),
                match: test.match === "includes" ? "includes" as const : "exact" as const,
                ...(Array.isArray(test.files) && test.files.length > 0
                    ? { files: normalizeFixtureFiles(test.files) }
                    : {}),
            }))
            .filter((test) => test.stdout.length > 0)
        : [];

    if (normalized.length < 1) {
        throw new Error(
            `Compiled-language code_input exercise "${exerciseId}" needs at least one fixed test.`,
        );
    }

    return normalized;
}

function makeHelpFallback(args: {
    languageLabel: string;
    title: string;
    prompt: string;
}): CodeInputHelpFallback {
    const task = args.title || args.prompt || `${args.languageLabel} exercise`;
    return {
        hint: `Open the named implementation file for “${task}” and make one focused change at a time.`,
        help: {
            concept: `This ${args.languageLabel} exercise checks the compiled program and the required implementation technique.`,
            hint_1: "Run the supplied test harness after each focused change.",
            hint_2: "Keep the implementation general; do not print the expected output directly.",
        },
    };
}

export function createCompiledLanguageProfile(args: {
    id: string;
    shape: SubjectShapePack;
    language: WorkspaceLanguage;
    languageLabel: string;
    defaultEntryFileName: string;
    defaultStarterCode: string;
    authoringRules?: string[];
}): CourseProfile {
    const codeInput: CodeInputProfileCapability = {
        minimumFixedTests: 1,
        defaultStarter() {
            return args.defaultStarterCode;
        },
        defaultRecipeType() {
            return "fixed_tests";
        },
        getHelpFallback(helpArgs) {
            return makeHelpFallback({
                languageLabel: args.languageLabel,
                title: helpArgs.title,
                prompt: helpArgs.prompt,
            });
        },
        showExpectedExample() {
            return true;
        },
        buildManifest(buildArgs): ManifestCodeInput {
            const messageBase = buildArgs.messageBase;
            const starterCodeTag = messageTag(messageBase, "starterCode");
            const solutionCodeTag = messageTag(messageBase, "solutionCode");
            const entryFilePath = normalizePath(
                buildArgs.exercise.entryFilePath ?? args.defaultEntryFileName,
                `Invalid ${args.languageLabel} entryFilePath`,
            );

            const authoredStarterFiles = normalizeStarterFiles(
                buildArgs.exercise.starterFiles,
                args.language,
            );
            const authoredSolutionFiles = normalizeStarterFiles(
                buildArgs.exercise.solutionFiles,
                args.language,
            );

            const starterFilesBase = authoredStarterFiles.length > 0
                ? authoredStarterFiles
                : [{
                    path: entryFilePath,
                    content: buildArgs.exercise.starterCode,
                    language: args.language,
                    isEntry: true,
                    entry: true,
                }];
            const solutionFilesBase = authoredSolutionFiles.length > 0
                ? authoredSolutionFiles
                : [{
                    path: entryFilePath,
                    content: buildArgs.exercise.solutionCode,
                    language: args.language,
                    isEntry: true,
                    entry: true,
                }];

            const ensureEntry = (files: ManifestStarterFile[], fallbackContent: string) =>
                files.some((file) => file.path === entryFilePath)
                    ? files
                    : [{
                        path: entryFilePath,
                        content: fallbackContent,
                        language: args.language,
                        isEntry: true,
                        entry: true,
                    }, ...files];

            const starterFiles = ensureEntry(
                starterFilesBase,
                buildArgs.exercise.starterCode,
            ).map((file, index) => ({
                ...file,
                content: file.path === entryFilePath
                    ? starterCodeTag
                    : starterFileContentMessageTag({
                        messageBase,
                        filePath: file.path,
                        index,
                    }),
                language: file.language ?? args.language,
                isEntry: file.path === entryFilePath,
                entry: file.path === entryFilePath,
            }));

            const solutionFiles = ensureEntry(
                solutionFilesBase,
                buildArgs.exercise.solutionCode,
            ).map((file, index, files) => ({
                ...file,
                content: file.path === entryFilePath && files.length === 1
                    ? solutionCodeTag
                    : solutionFileContentMessageTag({
                        messageBase,
                        filePath: file.path,
                        index,
                    }),
                language: file.language ?? args.language,
                isEntry: file.path === entryFilePath,
                entry: file.path === entryFilePath,
            }));

            const sourceChecks = Array.isArray(buildArgs.exercise.sourceChecks)
                ? buildArgs.exercise.sourceChecks.map((check, index) => ({
                    ...check,
                    message: semanticCheckMessageTag({ messageBase, index }),
                }))
                : undefined;
            const fixtureFiles = normalizeFixtureFiles(buildArgs.exercise.files);

            return {
                id: buildArgs.exercise.id,
                kind: "code_input",
                purpose: "project",
                weight: 1,
                messageBase,
                language: args.language,
                starterCode: starterCodeTag,
                starterFiles,
                solutionFiles,
                ...(sourceChecks?.length ? { sourceChecks } : {}),
                workspace: {
                    language: args.language,
                    entryFilePath,
                    starterCode: starterCodeTag,
                    starterFiles,
                    ...(fixtureFiles.length > 0 ? { files: fixtureFiles } : {}),
                },
                showExpectedExample: true,
                recipe: {
                    type: "fixed_tests",
                    tests: requireTests(buildArgs.exercise.tests, buildArgs.exercise.id),
                    solutionCode: solutionCodeTag,
                    solutionFiles,
                    ...(sourceChecks?.length ? { sourceChecks } : {}),
                },
            };
        },
    };

    return {
        id: args.id,
        shape: args.shape,
        runtimeKind: "code",
        defaultLanguage: args.language,
        defaultEntryFileName: args.defaultEntryFileName,
        allowedExerciseKinds: [
            "single_choice",
            "multi_choice",
            "drag_reorder",
            "fill_blank_choice",
            "code_input",
        ],
        allowedRecipeTypes: ["fixed_tests"],
        buildModuleRuntimeDefaults() {
            return {
                kind: "code",
                language: args.language,
                supportsTerminal: false,
                supportsMultiFile: true,
                supportsFileSystem: true,
                supportsStdInStdOut: true,
                supportsPackageInstall: false,
            };
        },
        buildModuleServiceDefaults() {
            return {
                preset: "runner",
                runnerBackend: "judge0",
                layoutMode: "default",
                requires: { files: true, multiFile: true, terminal: false },
            };
        },
        renderAuthoringPromptRules() {
            return [
                `Use profileId "${args.id}" and fixedLanguage "${args.language}".`,
                `Use entryFilePath "${args.defaultEntryFileName}" unless the lesson intentionally needs another entry file.`,
                "For multi-file exercises, provide every starterFiles and solutionFiles path explicitly.",
                "Use fixed_tests for compiled programs and include deterministic stdout expectations.",
                "Use path-specific sourceChecks when the required algorithm belongs in a non-entry implementation file.",
                ...(args.authoringRules ?? []),
            ];
        },
        renderExerciseKindPromptRules() {
            return [
                `For ${args.languageLabel} code_input, use recipeType "fixed_tests".`,
                "Give learners the complete harness, headers, and unchanged support files.",
                "Put TODO markers only in the implementation file the learner should edit.",
                "Grade observable behavior and use source checks only for essential algorithmic constraints.",
            ];
        },
        codeInput,
        getRecipeRegistry() {
            return {};
        },
        validateTopicBundle() {
            return [];
        },
    };
}
