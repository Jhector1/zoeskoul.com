import type {
    ManifestCodeInputCompilerInput,
    ManifestStarterFile,
    ProgrammingCodeInputStarterFileDraft,
} from "@zoeskoul/curriculum-contracts";
import { normalizeWorkspacePath } from "@zoeskoul/curriculum-contracts";
import type {
    CodeInputProfileCapability,
    CourseProfile,
} from "../types.js";
import {
    messageTag,
    solutionFileContentMessageTag,
    starterFileContentMessageTag,
} from "../shared/messageTags.js";
import { apiShape } from "../shapes/apiShape.js";

function normalizePath(value: string, label: string) {
    try {
        return normalizeWorkspacePath(value);
    } catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`, {
            cause: error,
        });
    }
}

function normalizeFiles(
    files: ProgrammingCodeInputStarterFileDraft[] | undefined,
): ManifestStarterFile[] {
    if (!Array.isArray(files)) return [];

    const seen = new Set<string>();
    const out: ManifestStarterFile[] = [];

    for (const file of files) {
        const path = normalizePath(file.path, "Invalid API workspace path");
        if (seen.has(path)) {
            throw new Error(`Duplicate API workspace path: ${path}`);
        }
        seen.add(path);
        out.push({
            ...file,
            path,
            content: String(file.content ?? ""),
            language: file.language ?? "javascript",
        });
    }

    return out;
}

const apiCodeInput: CodeInputProfileCapability = {
    defaultStarter() {
        return `const express = require("express");

const app = express();
app.use(express.json());

// Add the route required by the exercise.

app.listen(3000, "127.0.0.1", () => {
  console.log("API listening on http://127.0.0.1:3000");
});
`;
    },

    defaultRecipeType() {
        return "source_checks";
    },

    repairDraft(args) {
        return {
            ...args.exercise,
            fixedLanguage: "javascript",
            recipeType: "source_checks",
            entryFilePath: args.exercise.entryFilePath ?? "server.js",
        };
    },

    getHelpFallback(args) {
        return {
            hint: `Read the task "${args.title || args.prompt || "API exercise"}" and trace the request from route to response.`,
            help: {
                concept: "An API route receives an HTTP request, applies focused application logic, and sends a predictable HTTP response.",
                hint_1: "Check the method, path, status code, and JSON shape required by the task.",
                hint_2: "Keep the route focused. Move repeated data access or validation into a helper when the lesson introduces that boundary.",
            },
        };
    },

    showExpectedExample() {
        return true;
    },

    buildManifest(args): ManifestCodeInputCompilerInput {
        if (
            !Array.isArray(args.exercise.sourceChecks) ||
            args.exercise.sourceChecks.length < 1
        ) {
            throw new Error(
                `API code_input exercise "${args.exercise.id}" needs at least one sourceChecks entry.`,
            );
        }

        const entryFilePath = normalizePath(
            args.exercise.entryFilePath ?? "server.js",
            "Invalid API entryFilePath",
        );
        const starterTag = messageTag(args.messageBase, "starterCode");
        const solutionTag = messageTag(args.messageBase, "solutionCode");
        const authoredStarter = normalizeFiles(args.exercise.starterFiles);
        const authoredSolution = normalizeFiles(args.exercise.solutionFiles);

        const rawStarter: ManifestStarterFile[] =
            authoredStarter.length > 0
                ? authoredStarter
                : [{
                    path: entryFilePath,
                    content: String(args.exercise.starterCode ?? ""),
                    language: "javascript",
                }];

        const rawSolution: ManifestStarterFile[] =
            authoredSolution.length > 0
                ? authoredSolution
                : [{
                    path: entryFilePath,
                    content: String(args.exercise.solutionCode ?? ""),
                    language: "javascript",
                }];

        const ensureEntry = (files: ManifestStarterFile[]) =>
            files.some((file) => file.path === entryFilePath)
                ? files
                : [{
                    path: entryFilePath,
                    content: "",
                    language: "javascript" as const,
                }, ...files];

        const starterFiles = ensureEntry(rawStarter).map((file, index) => ({
            ...file,
            content:
                file.path === entryFilePath
                    ? starterTag
                    : starterFileContentMessageTag({
                        messageBase: args.messageBase,
                        filePath: file.path ?? file.name,
                        index,
                    }),
            language: file.language ?? "javascript",
            isEntry: file.path === entryFilePath,
            entry: file.path === entryFilePath,
        }));

        const solutionFiles = ensureEntry(rawSolution).map(
            (file, index, files) => ({
                ...file,
                content:
                    file.path === entryFilePath && files.length === 1
                        ? solutionTag
                        : solutionFileContentMessageTag({
                            messageBase: args.messageBase,
                            filePath: file.path ?? file.name,
                            index,
                        }),
                language: file.language ?? "javascript",
                isEntry: file.path === entryFilePath,
                entry: file.path === entryFilePath,
            }),
        );

        return {
            id: args.exercise.id,
            kind: "code_input",
            purpose: "project",
            weight: 1,
            messageBase: args.messageBase,
            language: "javascript",
            starterCode: starterTag,
            starterFiles,
            solutionFiles,
            sourceChecks: args.exercise.sourceChecks,
            workspaceExpectations: args.exercise.workspaceExpectations,
            ...(args.exercise.terminalExpectations
                ? { terminalExpectations: args.exercise.terminalExpectations }
                : {}),
            ...(args.exercise.hiddenShellCheck
                ? { hiddenShellCheck: args.exercise.hiddenShellCheck }
                : {}),
            workspace: {
                language: "javascript",
                entryFilePath,
                starterFiles,
                ...(args.exercise.workspaceExpectations
                    ? { workspaceExpectations: args.exercise.workspaceExpectations }
                    : {}),
            },
            showExpectedExample: true,
            recipe: {
                type: "source_checks",
                solutionCode: solutionTag,
                solutionFiles,
                ...(Array.isArray(args.exercise.tests) && args.exercise.tests.length > 0
                    ? { tests: args.exercise.tests }
                    : {}),
            },
        };
    },
};

export const apiProfile: CourseProfile = {
    id: "api",
    shape: apiShape,
    runtimeKind: "code",
    defaultLanguage: "javascript",
    defaultEntryFileName: "server.js",
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["source_checks"],
    codeInput: apiCodeInput,
    practice: {
        tryItDefault: {
            enabled: true,
            placement: "all_sketches",
            sketchIndex: 0,
            allowReveal: false,
        },
        preferredTryItExerciseKind: "code_input",
    },

    buildModuleRuntimeDefaults() {
        return {
            kind: "code",
            language: "javascript",
            supportsTerminal: true,
            supportsMultiFile: true,
            supportsFileSystem: true,
            supportsStdInStdOut: true,
            supportsPackageInstall: false,
            fileActions: {
                enabled: true,
                createFile: true,
                createFolder: true,
                rename: true,
                delete: true,
                dragDrop: false,
            },
        };
    },

    buildModuleServiceDefaults() {
        return {
            preset: "runner",
            runnerBackend: "pty",
            layoutMode: "terminal_workspace",
            requires: {
                files: true,
                multiFile: true,
                terminal: true,
            },
        };
    },

    renderExerciseKindPromptRules() {
        return [
            '- For API code_input, use fixedLanguage "javascript" and recipeType "source_checks".',
            '- Use entryFilePath "server.js" unless a lesson deliberately introduces a different Node.js file boundary.',
            "- Every API code_input needs sourceChecks that verify required JavaScript/Express/SQL structure without forcing one exact formatting style.",
            "- Learners run server processes and localhost checks in the integrated terminal; do not require public network access.",
            "- Express is pre-provisioned by Zoéskoul. Do not ask learners to run npm install.",
            "- SQLite persistence uses the local learner workspace. Database files stay under data/ or another authored workspace path.",
        ];
    },

    renderAuthoringPromptRules() {
        return [
            'Use profileId "api" for API Foundations.',
            'Use workspaceProfileId "node-api-runner" for Node.js/Express API practice.',
            "Teach HTTP semantics before persistence, then preserve the HTTP contract when replacing in-memory storage with SQLite.",
            "Use deterministic localhost requests only. External network access is unavailable by design.",
            "Keep ordinary lesson Try Its in sketchBlocks[].tryItExercises; use progressive quizDraft code_input steps only for deliberate projects/capstones.",
            "Do not impose fixed topic, sketch, Try It, or module counts; add units only when they create distinct learning value.",
        ];
    },

    getRecipeRegistry() {
        return {};
    },

    validateTopicBundle(bundle) {
        const issues: string[] = [];

        for (const exercise of bundle.exercises ?? []) {
            if (exercise.kind !== "code_input") continue;

            if (exercise.language !== "javascript") {
                issues.push(
                    `API code_input "${exercise.id}" must declare language "javascript".`,
                );
            }

            if (exercise.recipe?.type !== "source_checks") {
                issues.push(
                    `API code_input "${exercise.id}" must use recipe.type "source_checks".`,
                );
            }

            if (
                !Array.isArray(exercise.sourceChecks) ||
                exercise.sourceChecks.length < 1
            ) {
                issues.push(
                    `API code_input "${exercise.id}" must include sourceChecks.`,
                );
            }
        }

        return issues;
    },
};
