import type {
    ManifestCodeInputCompilerInput,
    ManifestStarterFile,
    ProgrammingCodeInputStarterFileDraft,
} from "@zoeskoul/curriculum-contracts";
import { normalizeWorkspacePath } from "@zoeskoul/curriculum-contracts";
import type { CodeInputProfileCapability, CourseProfile } from "../types.js";
import { messageTag, solutionFileContentMessageTag, starterFileContentMessageTag } from "../shared/messageTags.js";
import { webShape } from "../shapes/webShape.js";

function normalizePath(value: string, label: string) {
    try {
        return normalizeWorkspacePath(value);
    } catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`);
    }
}

function normalizeFiles(
    files: ProgrammingCodeInputStarterFileDraft[] | undefined,
): ManifestStarterFile[] {
    if (!Array.isArray(files)) return [];
    const seen = new Set<string>();
    const out: ManifestStarterFile[] = [];
    for (const file of files) {
        const path = normalizePath(file.path, "Invalid web workspace path");
        if (seen.has(path)) throw new Error(`Duplicate web workspace path: ${path}`);
        seen.add(path);
        out.push({
            ...file,
            path,
            content: String(file.content ?? ""),
            language: file.language ?? "web",
        });
    }
    return out;
}

const webCodeInput: CodeInputProfileCapability = {
    defaultStarter() {
        return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Page</title>
  </head>
  <body>
    <!-- Write your HTML here -->
  </body>
</html>
`;
    },
    defaultRecipeType() {
        return "source_checks";
    },
    getHelpFallback(args) {
        return {
            hint: `Read the task “${args.title || args.prompt || "HTML exercise"}” and compare your tags with the live preview.`,
            help: {
                concept: "HTML describes the structure and meaning of the page shown in the browser preview.",
                hint_1: "Edit index.html in the code editor and watch the preview update.",
                hint_2: "Check tag names, nesting, required attributes, and visible text before checking your answer.",
            },
        };
    },
    showExpectedExample() {
        return false;
    },
    buildManifest(args): ManifestCodeInputCompilerInput {
        if (!Array.isArray(args.exercise.sourceChecks) || args.exercise.sourceChecks.length < 1) {
            throw new Error(`Web code_input exercise "${args.exercise.id}" needs at least one sourceChecks entry.`);
        }

        const entryFilePath = normalizePath(
            args.exercise.entryFilePath ?? "index.html",
            "Invalid web entryFilePath",
        );
        const starterTag = messageTag(args.messageBase, "starterCode");
        const solutionTag = messageTag(args.messageBase, "solutionCode");
        const authoredStarter = normalizeFiles(args.exercise.starterFiles);
        const authoredSolution = normalizeFiles(args.exercise.solutionFiles);

        const rawStarter: ManifestStarterFile[] = authoredStarter.length > 0
            ? authoredStarter
            : [{ path: entryFilePath, content: String(args.exercise.starterCode ?? ""), language: "web" }];
        const rawSolution: ManifestStarterFile[] = authoredSolution.length > 0
            ? authoredSolution
            : [{ path: entryFilePath, content: String(args.exercise.solutionCode ?? ""), language: "web" }];

        const ensureEntry = (files: ManifestStarterFile[]) =>
            files.some((file) => file.path === entryFilePath)
                ? files
                : [{ path: entryFilePath, content: "", language: "web" }, ...files];

        const starterFiles = ensureEntry(rawStarter).map((file, index) => ({
            ...file,
            content: file.path === entryFilePath
                ? starterTag
                : starterFileContentMessageTag({
                    messageBase: args.messageBase,
                    filePath: file.path ?? file.name,
                    index,
                }),
            language: file.language ?? "web",
            isEntry: file.path === entryFilePath,
            entry: file.path === entryFilePath,
        }));

        const solutionFiles = ensureEntry(rawSolution).map((file, index, files) => ({
            ...file,
            content: file.path === entryFilePath && files.length === 1
                ? solutionTag
                : solutionFileContentMessageTag({
                    messageBase: args.messageBase,
                    filePath: file.path ?? file.name,
                    index,
                }),
            language: file.language ?? "web",
            isEntry: file.path === entryFilePath,
            entry: file.path === entryFilePath,
        }));

        return {
            id: args.exercise.id,
            kind: "code_input",
            purpose: "project",
            weight: 1,
            messageBase: args.messageBase,
            language: "web",
            starterCode: starterTag,
            starterFiles,
            solutionFiles,
            sourceChecks: args.exercise.sourceChecks,
            workspaceExpectations: args.exercise.workspaceExpectations,
            workspace: {
                language: "web",
                entryFilePath,
                starterFiles,
                ...(args.exercise.workspaceExpectations
                    ? { workspaceExpectations: args.exercise.workspaceExpectations }
                    : {}),
            },
            showExpectedExample: false,
            recipe: {
                type: "source_checks",
                solutionCode: solutionTag,
                solutionFiles,
            },
        };
    },
};

export const webProfile: CourseProfile = {
    id: "web",
    shape: webShape,
    runtimeKind: "code",
    defaultLanguage: "web",
    defaultEntryFileName: "index.html",
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["source_checks"],
    codeInput: webCodeInput,
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
            language: "web",
            supportsTerminal: false,
            supportsMultiFile: true,
            supportsFileSystem: true,
            supportsStdInStdOut: false,
            supportsPackageInstall: false,
            fileActions: {
                enabled: true,
                createFile: true,
                createFolder: true,
                rename: true,
                delete: true,
                dragDrop: true,
            },
        };
    },
    renderExerciseKindPromptRules() {
        return [
            '- For HTML code_input, use fixedLanguage "web" and recipeType "source_checks".',
            '- Every HTML code_input needs at least one sourceChecks entry.',
            '- Prefer source_regex checks that verify required elements, attributes, and nesting intent without forcing one exact formatting style.',
            '- Use path: "index.html" on source checks for HTML Foundations.',
            '- Do not create stdout tests or Judge0 execution for HTML-only work.',
        ];
    },
    renderAuthoringPromptRules() {
        return [
            "Use the existing ZoeSkoul web workspace and live browser preview.",
            "Teach semantic HTML before CSS styling or JavaScript behavior.",
            "Keep starter pages small enough for beginners to read in one screen.",
            "Every hands-on task should produce a visible change in the browser preview.",
        ];
    },
    getRecipeRegistry() {
        return {};
    },
    validateTopicBundle() {
        return [];
    },
};
