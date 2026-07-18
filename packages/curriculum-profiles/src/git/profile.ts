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
            'Every Git code_input must use fixedLanguage "bash", recipeType "shell_task", mode "terminal_workspace", and entryFilePath "main.sh".',
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
            "Configure a deterministic local identity in starter setup or instructions: ZoeSkoul Learner and learner@zoeskoul.local.",
            "Set the initial branch to main whenever branch naming matters.",
            "Use local bare repositories for origin, push, fetch, pull, and remote-tracking exercises.",
            "Do not require GitHub credentials, personal access tokens, public network access, or external repositories.",
            "Do not assert exact commit hashes or environment-dependent commit dates.",
            "Do not teach reset --hard, force push, or history rewriting in beginner courses unless the course explicitly targets advanced recovery.",
        ];
    },
});


const baseGitRepairDraft = baseGitProfile.codeInput?.repairDraft;

export const gitProfile: CourseProfile = {
    ...baseGitProfile,
    ...(baseGitProfile.codeInput
        ? {
            codeInput: {
                ...baseGitProfile.codeInput,
                repairDraft(args) {
                    const repaired =
                        baseGitRepairDraft?.(args) ?? args.exercise;
                    return repairMissingGitEvidence(repaired);
                },
            },
        }
        : {}),
};
