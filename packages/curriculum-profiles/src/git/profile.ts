import {
    deriveManifestTerminalBootstrap,
    normalizeWorkspacePath,
    type ManifestCodeInput,
    type ManifestStarterFile,
} from "@zoeskoul/curriculum-contracts";
import type {
    CodeInputHelpFallback,
    CourseProfile,
    ProfileCodeInputDraft,
} from "../types.js";
import { gitShape } from "../shapes/gitShape.js";
import { createTerminalCourseProfile } from "../terminal/createTerminalCourseProfile.js";
import { buildGitExpectationsHiddenShellCheck } from "./gitExpectations.js";


function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function commandPattern(command: string): string {
    return `^${escapeRegex(command.trim()).replace(/\s+/g, "\\s+")}$`;
}

function hasTerminalWorkspaceEvidence(exercise: ProfileCodeInputDraft): boolean {
    return Boolean(
        exercise.workspaceExpectations ||
        exercise.terminalExpectations ||
        exercise.hiddenShellCheck ||
        exercise.gitExpectations ||
        (Array.isArray(exercise.sourceChecks) && exercise.sourceChecks.length > 0),
    );
}

function inferSafeGitCommandExpectations(
    solutionCode: string | undefined,
): ProfileCodeInputDraft["terminalExpectations"] | undefined {
    const commands = [
        ...new Set(
            String(solutionCode ?? "")
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => /^git(?:\s|$)/.test(line)),
        ),
    ];

    if (commands.length === 0) return undefined;

    return {
        requiredCommands: commands.map((command) => ({
            pattern: commandPattern(command),
            message: `Run \`${command}\`, then check your answer again.`,
        })),
    };
}

function repairMissingGitEvidence(
    exercise: ProfileCodeInputDraft,
): ProfileCodeInputDraft {
    if (hasTerminalWorkspaceEvidence(exercise)) return exercise;

    const terminalExpectations = inferSafeGitCommandExpectations(
        exercise.solutionCode,
    );
    if (!terminalExpectations) return exercise;

    return {
        ...exercise,
        terminalExpectations,
    };
}



type GitTerminalManifest = ManifestCodeInput & {
    ideConfig?: Record<string, unknown>;
    fixtureFiles?: ManifestStarterFile[];
    workspace?: (NonNullable<ManifestCodeInput["workspace"]> & {
        fixtureFiles?: ManifestStarterFile[];
    }) | null;
};

/**
 * Git repositories are materialized in an isolated PTY workspace that may be
 * written by a different container user than the interactive shell. Keep the
 * trust scope narrow and profile-owned so learners never see infrastructure
 * ownership errors or setup commands.
 */
const GIT_SAFE_WORKSPACE_SCOPE = "/workspace/*";
const GIT_SETUP_SCRIPT_PATH = ".zoeskoul/setup.sh";

function gitLearningServiceDefaults() {
    return {
        preset: "runner" as const,
        runnerBackend: "pty" as const,
        layoutMode: "default" as const,
        terminalBootstrap: {
            gitSafeDirectories: [GIT_SAFE_WORKSPACE_SCOPE],
            setupScriptPath: GIT_SETUP_SCRIPT_PATH,
        },
        requires: { files: true, multiFile: true, terminal: true },
    };
}

function gitRepositoryCwd(exercise: ProfileCodeInputDraft): string {
    const repositoryPath = exercise.gitExpectations?.repositoryPath?.trim();
    return repositoryPath ? `/workspace/${repositoryPath}` : "/workspace";
}

function gitManifestFilePath(file: ManifestStarterFile): string {
    return String(file.path ?? file.name ?? "").trim();
}

function isInternalGitWorkspaceFile(path: string): boolean {
    return path === "main.sh" || path.startsWith(".zoeskoul/");
}

function gitEditorLanguage(path: string): string {
    const lower = path.toLowerCase();

    if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".html")) return "html";
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".js")) return "javascript";
    if (lower.endsWith(".ts")) return "typescript";
    if (lower.endsWith(".sh")) return "bash";

    return "text";
}

function withoutEntryFlags(file: ManifestStarterFile): ManifestStarterFile {
    const {
        isEntry: _isEntry,
        entry: _entry,
        ...rest
    } = file;

    return rest;
}

function gitAuthoredBootstrapFiles(
    exercise: ProfileCodeInputDraft,
): ManifestStarterFile[] {
    if (!Array.isArray(exercise.starterFiles)) return [];

    return exercise.starterFiles.map((file) => ({
        path: normalizeWorkspacePath(file.path),
        content: String(file.content ?? ""),
        language: file.language ?? "bash",
        ...(typeof file.readOnly === "boolean"
            ? { readOnly: file.readOnly }
            : {}),
    }));
}

function gitFixtureFiles(manifest: ManifestCodeInput): ManifestStarterFile[] {
    if (!Array.isArray(manifest.starterFiles)) return [];

    return manifest.starterFiles
        .filter((file) => gitManifestFilePath(file) !== "main.sh")
        .map((file) => {
            const path = gitManifestFilePath(file);

            return {
                ...withoutEntryFlags(file),
                path,
                language: path.startsWith(".zoeskoul/")
                    ? "bash"
                    : gitEditorLanguage(path),
            };
        });
}

function gitVisibleStarterFiles(
    fixtureFiles: ManifestStarterFile[],
): ManifestStarterFile[] {
    return fixtureFiles.filter(
        (file) => !isInternalGitWorkspaceFile(gitManifestFilePath(file)),
    );
}

function pickGitEntryFilePath(args: {
    exercise: ProfileCodeInputDraft;
    files: ManifestStarterFile[];
}): string {
    const repositoryPath = args.exercise.gitExpectations?.repositoryPath?.trim();
    const candidates = args.files
        .map((file) => gitManifestFilePath(file))
        .filter(Boolean);
    const repositoryCandidates = repositoryPath
        ? candidates.filter(
            (path) =>
                path === repositoryPath ||
                path.startsWith(`${repositoryPath}/`),
        )
        : candidates;
    const pool =
        repositoryCandidates.length > 0 ? repositoryCandidates : candidates;

    return (
        pool.find((path) => /(^|\/)readme\.md$/i.test(path)) ??
        pool.find((path) => /\.md$/i.test(path)) ??
        pool[0] ??
        "README.md"
    );
}

function markGitEntryFile(args: {
    files: ManifestStarterFile[];
    entryFilePath: string;
}): ManifestStarterFile[] {
    return args.files.map((file) => {
        const path = gitManifestFilePath(file);
        const entry = path === args.entryFilePath;

        return {
            ...withoutEntryFlags(file),
            path,
            language: gitEditorLanguage(path),
            ...(entry ? { isEntry: true, entry: true } : {}),
        };
    });
}

function withGitEditorWorkspace(args: {
    manifest: ManifestCodeInput;
    exercise: ProfileCodeInputDraft;
}): ManifestCodeInput {
    const terminalCwd = gitRepositoryCwd(args.exercise);
    const fixtureFiles = gitFixtureFiles(args.manifest);
    const authoredBootstrapFiles = gitAuthoredBootstrapFiles(args.exercise);
    const serviceDefaults = gitLearningServiceDefaults();
    const terminalBootstrap = deriveManifestTerminalBootstrap({
        bootstrap: serviceDefaults.terminalBootstrap,
        terminalCwd,
        // The compiled starter files contain message references. Hash the
        // authored hidden setup recipe instead so a repository-state change
        // rotates the PTY lease while visible learner edits do not.
        files:
            authoredBootstrapFiles.length > 0
                ? authoredBootstrapFiles
                : fixtureFiles,
    });
    const visibleFiles = gitVisibleStarterFiles(fixtureFiles);
    const entryFilePath = pickGitEntryFilePath({
        exercise: args.exercise,
        files: visibleFiles,
    });
    const starterFiles = markGitEntryFile({
        files: visibleFiles,
        entryFilePath,
    });
    const entryFile = starterFiles.find(
        (file) => gitManifestFilePath(file) === entryFilePath,
    );
    const starterCode = String(entryFile?.content ?? "");
    const ideConfig = {
        ...serviceDefaults,
        terminalBootstrap,
        terminalSessionScope: "exercise",
        terminalCwd,
        fileActions: {
            enabled: true,
            createFile: true,
            createFolder: true,
            rename: true,
            delete: true,
            dragDrop: false,
        },
    };
    const manifest = args.manifest as GitTerminalManifest;
    const {
        starterFiles: _starterFiles,
        solutionFiles: _solutionFiles,
        ...manifestWithoutSyntheticShellFiles
    } = manifest;

    return {
        ...manifestWithoutSyntheticShellFiles,
        starterCode,
        starterFiles,
        serviceOverrides: ideConfig as ManifestCodeInput["serviceOverrides"],
        ideConfig,
        ...(fixtureFiles.length > 0 ? { fixtureFiles } : {}),
        workspace: {
            ...(manifest.workspace ?? {}),
            language: "bash",
            entryFilePath,
            starterCode,
            starterFiles,
            ...(fixtureFiles.length > 0 ? { fixtureFiles } : {}),
        },
    } as ManifestCodeInput;
}

function makeGitCodeHelpFallback(args: {
    title: string;
    prompt: string;
}): CodeInputHelpFallback {
    const task = args.title || args.prompt || "this Git repository task";

    return {
        hint: `Read the Git task "${task}" and identify the repository state you need to create.`,
        help: {
            concept: `This Git exercise checks the repository state produced by "${task}".`,
            hint_1: "Use git status before and after each small change so you can see what moved between the working tree, staging area, and history.",
            hint_2: "Match the requested file names, branch names, and commit purpose before clicking Check Answer.",
        },
    };
}

const baseGitProfile = createTerminalCourseProfile({
    id: "git",
    shape: gitShape,
    errorLabel: "Git",
    validationLabel: "Git",
    defaultStarterCode: "# Use the terminal for this Git task.\n",
    forceTerminalWorkspace: true,
    buildModuleServiceDefaults() {
        return gitLearningServiceDefaults();
    },
    makeHelpFallback: makeGitCodeHelpFallback,
    requireTerminalWorkspace() {
        return true;
    },
    buildAdditionalHiddenShellCheck({ exercise }) {
        return buildGitExpectationsHiddenShellCheck(exercise.gitExpectations);
    },
    renderExerciseKindPromptRules() {
        return [
            '- For Git code_input, use recipeType "shell_task" and mode "terminal_workspace".',
            '- Keep exercise language exactly "bash" because Git commands run in the terminal.',
            "- Grade the final repository with gitExpectations; use terminalExpectations only when the learner must demonstrate a specific safe command.",
            "- Never grade exact commit hashes, machine-dependent timestamps, or absolute workspace paths.",
            "- Use local bare repositories for remote workflows instead of public network access.",
        ];
    },
    renderAuthoringPromptRules(args) {
        const counts = (args.seed?.plannedExerciseCounts?.counts ?? {}) as Record<
            string,
            number | undefined
        >;
        const requiredCodeInputs = Number(counts.code_input ?? 0);

        return [
            'Use profileId "git" for Git and GitHub coursework while reusing the terminal-workspace runner.',
            "quizDraft is the shared authoring exercise collection, not the final learner quiz card.",
            "quizDraft must include every Git code_input required by the exercise policy; do not put code_input only in projectDraft.",
            "The quizzesDoNotUseCodeInput policy applies only to the final learner quiz card and never forbids runtime Try It code_input inside quizDraft.",
            requiredCodeInputs > 0
                ? `This topic requires exactly ${requiredCodeInputs} Git code_input item(s) inside quizDraft.`
                : "If the exercise policy requires code_input, put those code_input items inside quizDraft.",
            "Never replace a required Git code_input with fill_blank_choice, single_choice, multi_choice, or drag_reorder.",
            "For all_sketches placement, emit one distinct try-<topic-id>-sketchN code_input per sketch, up to the exact required code_input count.",
            'Every Git code_input must use fixedLanguage "bash", recipeType "shell_task", and mode "terminal_workspace".',
            "Use a real project file such as README.md, notes.md, or .gitignore as the editor entry file; never create a synthetic main.sh for Git coursework.",
            "Keep the Git editor, explorer, and terminal visible together. Git inherits the shared PTY runtime but uses the normal workspace layout instead of the Linux terminal-only presentation.",
            "Every Git terminal instruction must explicitly tell the learner to type the command and press Enter.",
            'Every non-project technical Git topic must include a concrete teaching walkthrough in sketchBlocks whose body explicitly begins with "Worked example:".',
            'A practice.conceptualOnly topic omits code_input practice; it does not omit the concrete "Worked example:" teaching walkthrough.',
            "For a course-opening topic, keep the reading-only course introduction and the worked-example teaching sketch as separate sketchBlocks; the introduction must never replace the worked example.",
            "Every Git code_input must include at least one non-empty grading-evidence object: gitExpectations, workspaceExpectations, terminalExpectations, or hiddenShellCheck.",
            "starterCode, solutionCode, starterFiles, solutionFiles, and tests do not replace grading evidence for shell_task terminal_workspace exercises.",
            "Use workspaceExpectations for ordinary file-tree outcomes and gitExpectations for repository state.",
            "Prefer gitExpectations fields such as repositoryInitialized, currentBranch, cleanWorkingTree, commit counts, trackedFiles, ignoredFiles, requiredBranches, commitMessages, headFiles, and remotes.",
            "Use terminalExpectations only when the exact safe command matters; repository state remains the primary proof of completion.",
            "For a command-observation task such as git status or git log, use terminalExpectations.requiredCommands with a regex such as ^git\\s+status$.",
            "Prepare prerequisite files and repository history internally; never ask the learner to run .zoeskoul/setup.sh or another platform bootstrap command.",
            "Treat every Git code_input as an isolated workspace: its hidden setup must reconstruct all prerequisite files, branches, commits, index state, and local remotes instead of relying on a previous exercise or PTY session.",
            "Set gitExpectations.repositoryPath to the learner repository folder so the shared terminal workspace opens there automatically.",
            "Configure a deterministic local identity in the internal starter setup: ZoeSkoul Learner and learner@zoeskoul.local.",
            "Set the initial branch to main whenever branch naming matters.",
            "Use local bare repositories for origin, push, fetch, pull, and remote-tracking exercises.",
            "Do not require GitHub credentials, personal access tokens, public network access, or external repositories.",
            "Do not assert exact commit hashes or environment-dependent commit dates.",
            "Do not teach reset --hard, force push, or history rewriting in beginner courses unless the course explicitly targets advanced recovery.",
        ];
    },
});


const baseGitRepairDraft = baseGitProfile.codeInput?.repairDraft;
const baseGitBuildManifest = baseGitProfile.codeInput?.buildManifest;

export const gitProfile: CourseProfile = {
    ...baseGitProfile,
    defaultEntryFileName: "README.md",
    defaultTools: {
        defaultSurface: "results",
        compactDefaultSurface: "results",
        runnerPane: {
            defaultTab: "terminal",
            compactDefaultTab: "terminal",
        },
    },
    ...(baseGitProfile.codeInput
        ? {
            codeInput: {
                ...baseGitProfile.codeInput,
                repairDraft(args) {
                    const repaired =
                        baseGitRepairDraft?.(args) ?? args.exercise;
                    return repairMissingGitEvidence(repaired);
                },
                buildManifest(args) {
                    if (!baseGitBuildManifest) {
                        throw new Error("Git terminal profile is missing buildManifest.");
                    }

                    return withGitEditorWorkspace({
                        manifest: baseGitBuildManifest(args),
                        exercise: args.exercise,
                    });
                },
            },
        }
        : {}),
};
