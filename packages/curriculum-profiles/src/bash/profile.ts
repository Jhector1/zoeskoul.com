import type { CodeInputHelpFallback } from "../types.js";
import { bashShape } from "../shapes/bashShape.js";
import { createTerminalCourseProfile } from "../terminal/createTerminalCourseProfile.js";

function makeBashCodeHelpFallback(args: {
    title: string;
    prompt: string;
}): CodeInputHelpFallback {
    const task = args.title || args.prompt || "this Linux terminal task";

    return {
        hint: `Read the Linux task "${task}" and identify the folders or files you must create or organize.`,
        help: {
            concept: `This Linux terminal exercise checks the final workspace state for "${task}".`,
            hint_1: "Use the terminal to make one small workspace change at a time, then inspect the result in the file explorer.",
            hint_2: "If a path is required, match the exact folder and file names before clicking Check Answer.",
        },
    };
}

export const bashProfile = createTerminalCourseProfile({
    id: "bash",
    shape: bashShape,
    errorLabel: "Bash",
    validationLabel: "Bash/Linux",
    defaultStarterCode: 'echo "Hello from Bash!"\n',
    makeHelpFallback: makeBashCodeHelpFallback,
    requireTerminalWorkspace({ bundle }) {
        const courseSlug = (bundle as { courseSlug?: string }).courseSlug;
        return (
            bundle.subjectSlug === "linux-terminal-fundamentals" ||
            courseSlug === "linux-terminal-fundamentals" ||
            bundle.subjectSlug?.includes("linux-terminal-fundamentals") === true
        );
    },
    terminalWorkspaceValidationLabel() {
        return "Linux Terminal Fundamentals";
    },
    renderExerciseKindPromptRules() {
        return [
            '- For Bash/Linux code_input, use recipeType "shell_task".',
            '- For Course 1 Linux labs, use mode "terminal_workspace".',
            "- Grade Bash/Linux terminal tasks from workspaceExpectations instead of stdout or Judge0.",
            '- Keep exercise language exactly "bash". Do not use "linux" as a language value.',
            '- Keep learner-facing titles about Linux or Linux Terminal, not Bash as the course name.',
        ];
    },
    renderAuthoringPromptRules(args) {
        const counts = (args.seed?.plannedExerciseCounts?.counts ?? {}) as Record<
            string,
            number | undefined
        >;
        const requiredCodeInputs = Number(counts.code_input ?? 0);

        return [
            'Use profileId "bash" for Linux terminal coursework so the app assigns terminal-first tooling.',
            "Keep Course 1 terminal tasks focused on workspace changes the checker can validate safely.",
            "quizDraft must include the Bash/Linux code_input exercises required by the exercise policy; do not put them only in projectDraft.",
            requiredCodeInputs > 0
                ? `This topic requires exactly ${requiredCodeInputs} Bash/Linux code_input item(s) inside quizDraft.`
                : "If the exercise policy requires code_input, put those code_input items inside quizDraft.",
            'Every Bash/Linux code_input must use fixedLanguage "bash", recipeType "shell_task", and mode "terminal_workspace".',
            'Every Bash/Linux code_input should include entryFilePath "main.sh" and starterCode or starterFiles with a main.sh entry file.',
            'Use workspaceExpectations for file-tree outcomes: requiredFolders, requiredFiles, forbiddenFiles, and entryFilePath.',
            'Use terminalExpectations only for command/output outcomes: requiredCommands, forbiddenCommands, outputContains, outputRegex, cwdContains, and cwdEndsWith.',
            'Do not use checker.defaultRecipe "workspace_expectations"; Linux terminal tasks compile through recipeType "shell_task" and pass expectations into the shell_task expected payload.',
            'Use per-exercise terminal workspaces for independent quiz/check questions; only use project/capstone scope when one activity intentionally shares a workspace across all steps.',
            "Do not replace missing Bash/Linux code_input exercises with extra fill_blank_choice items.",
            "Do not ask learners to write Bash scripts in Course 1; ask them to run terminal commands that shape or inspect the workspace.",
        ];
    },
});
