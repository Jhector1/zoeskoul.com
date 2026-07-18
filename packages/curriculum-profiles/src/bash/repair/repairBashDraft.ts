import {
    normalizeTerminalExpectations,
    type TerminalExpectations,
    type TopicAuthoringDraft,
    type TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { RepairReport } from "../../shared/profileServices.js";
import {
    type CodeInputDraft,
    repairDraftToPlannedExerciseCounts,
} from "../../shared/repairExercisePolicyDraft.js";

function safeSlug(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "linux-topic";
}

function commonHelp(topicTitle: string) {
    return {
        concept: `Use Bash commands in the Linux terminal to complete the workspace task for ${topicTitle}.`,
        hint_1: "Read the file or folder names carefully and run one command at a time.",
        hint_2: "Use inspection commands like pwd or ls before changing the workspace.",
    };
}

function requiredCommandPattern(
    pattern: string,
    message?: string,
): NonNullable<TerminalExpectations["requiredCommands"]>[number] {
    return message ? { pattern, message } : { pattern };
}

function forbiddenSudoExpectation() {
    return [
        requiredCommandPattern(
            "(^|\\s)sudo(\\s|$)",
            "Do not use sudo for beginner workspace tasks.",
        ),
    ];
}

function withBashSafetyExpectations(
    expectations: TerminalExpectations | undefined,
): TerminalExpectations {
    const normalized = normalizeTerminalExpectations(
        expectations,
        "Bash terminalExpectations",
    ) ?? {};

    return {
        ...normalized,
        forbiddenCommands:
            normalized.forbiddenCommands && normalized.forbiddenCommands.length > 0
                ? normalized.forbiddenCommands
                : forbiddenSudoExpectation(),
    };
}

function normalizeBashCodeInput(exercise: CodeInputDraft): CodeInputDraft {
    const prompt = exercise.prompt || exercise.title || "Complete the Linux terminal task.";
    const starterCode = exercise.starterCode || "# Use the terminal for this Linux task.\n";
    const entryFilePath = exercise.entryFilePath || "main.sh";

    return {
        ...exercise,
        prompt,
        starterCode,
        fixedLanguage: "bash",
        recipeType: "shell_task",
        mode: "terminal_workspace",
        entryFilePath,
        starterFiles:
            exercise.starterFiles && exercise.starterFiles.length > 0
                ? exercise.starterFiles
                : [
                      {
                          path: entryFilePath,
                          content: starterCode,
                          language: "bash",
                          isEntry: true,
                          entry: true,
                      },
                  ],
        solutionCode: exercise.solutionCode || "# Run the required terminal command(s).\n",
        hint:
            exercise.hint ||
            "Use the exact file and folder names from the prompt, then inspect the result with ls.",
        help: exercise.help ?? commonHelp(exercise.title || "this Linux task"),
        instructions: exercise.instructions || prompt,
        terminalExpectations: withBashSafetyExpectations(
            exercise.terminalExpectations,
        ),
    };
}

function isProgressiveProjectSeed(seed: TopicSeed): boolean {
    const projectSeed = seed as TopicSeed & {
        sectionRole?: string;
        moduleRole?: string;
        practice?: {
            projectFlow?: string;
        };
        authoringPolicy?: {
            projectRequirements?: {
                requireCumulativeChaining?: boolean;
            };
        };
    };

    return (
        projectSeed.practice?.projectFlow === "progressive" ||
        projectSeed.sectionRole === "module_project" ||
        projectSeed.sectionRole === "capstone" ||
        projectSeed.moduleRole === "capstone" ||
        projectSeed.authoringPolicy?.projectRequirements?.requireCumulativeChaining === true
    );
}

function uniq(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

function textStarterFile(path: string, content: string) {
    return {
        path,
        content,
        language: "text",
    };
}

function buildProgressiveBashProjectFallback(seed: TopicSeed, index: number): CodeInputDraft {
    const base = safeSlug(seed.topicId);
    const topicTitle = seed.title || seed.topicId || "Linux terminal project";
    const root = `${base}-park-survey`;
    const cappedIndex = Math.max(1, Math.min(index, 3));

    const plannedSteps = [
        {
            title: "Create the park survey request folder",
            folder: `${root}/requests`,
            file: `${root}/requests/north-trail.txt`,
            content: "North trail request log\n",
            command:
                `mkdir -p ${root}/requests\nprintf 'North trail request log\\n' > ${root}/requests/north-trail.txt\nls ${root}\n`,
            prompt:
                `You are helping a park survey team prepare a terminal map. Create ${root}/requests and add ${root}/requests/north-trail.txt so the team has a concrete request log to hand off.`,
            hint: `Use mkdir -p ${root}/requests, then write or create ${root}/requests/north-trail.txt.`,
        },
        {
            title: "Add the map notes folder",
            folder: `${root}/maps`,
            file: `${root}/maps/current-location.txt`,
            content: "Current location checked with pwd and ls\n",
            command:
                `mkdir -p ${root}/maps\nprintf 'Current location checked with pwd and ls\\n' > ${root}/maps/current-location.txt\nls ${root}\n`,
            prompt:
                `Continue the same park survey workspace. Keep the request log from step 1, then add ${root}/maps/current-location.txt as the team's navigation note deliverable.`,
            hint: `Do not remove the request log. Add ${root}/maps/current-location.txt inside the same ${root} workspace.`,
        },
        {
            title: "Prepare the handoff marker",
            folder: `${root}/handoff`,
            file: `${root}/handoff/terminal-map-ready.txt`,
            content: "Terminal map ready for the park survey team\n",
            command:
                `mkdir -p ${root}/handoff\nprintf 'Terminal map ready for the park survey team\\n' > ${root}/handoff/terminal-map-ready.txt\nfind ${root} -maxdepth 2 -type f | sort\n`,
            prompt:
                `Finish the cumulative park survey terminal map. Keep the request and map notes from the earlier steps, then create ${root}/handoff/terminal-map-ready.txt as the useful final deliverable.`,
            hint: `Preserve the earlier ${root} folders, then add the handoff marker file.`,
        },
    ];

    const activeSteps = plannedSteps.slice(0, cappedIndex);
    const previousSteps = plannedSteps.slice(0, Math.max(0, cappedIndex - 1));
    const currentStep = plannedSteps[cappedIndex - 1] ?? plannedSteps[0];
    const requiredFolders = uniq([
        root,
        ...activeSteps.map((step) => step.folder),
    ]);
    const requiredFiles = uniq(activeSteps.map((step) => step.file));
    const starterFiles = [
        {
            path: "main.sh",
            content: "# Use the terminal for this Linux project task.\n",
            language: "bash",
            isEntry: true,
            entry: true,
        },
        ...previousSteps.map((step) => textStarterFile(step.file, step.content)),
    ];
    const solutionFiles = [
        {
            path: "main.sh",
            content: currentStep.command,
            language: "bash",
            isEntry: true,
            entry: true,
        },
        ...activeSteps.map((step) => textStarterFile(step.file, step.content)),
    ];

    return normalizeBashCodeInput({
        id: `${base}-terminal-task-${index}`,
        kind: "code_input",
        title: currentStep.title,
        prompt: currentStep.prompt,
        hint: currentStep.hint,
        help: {
            concept:
                `Build the ${topicTitle} workspace as a cumulative real-world Linux terminal project.`,
            hint_1: "Start by checking the current folder with pwd and ls.",
            hint_2:
                "Keep the files from earlier steps and add the new folder or file for this step.",
        },
        starterCode: "# Use the terminal for this Linux project task.\n",
        fixedLanguage: "bash",
        recipeType: "shell_task",
        mode: "terminal_workspace",
        entryFilePath: "main.sh",
        solutionCode: currentStep.command,
        instructions: currentStep.prompt,
        starterFiles,
        solutionFiles,
        workspaceExpectations: {
            requiredFolders,
            requiredFiles,
        },
        terminalExpectations: {
            forbiddenCommands: forbiddenSudoExpectation(),
        },
    });
}

function makeBashCodeInputFallback(seed: TopicSeed, index: number): CodeInputDraft {
    if (isProgressiveProjectSeed(seed)) {
        return buildProgressiveBashProjectFallback(seed, index);
    }

    const base = safeSlug(seed.topicId);
    const topicTitle = seed.title || seed.topicId || "Linux terminal practice";
    const workspaceName = `${base}-workspace-${index}`;
    const notePath = `${workspaceName}/notes.txt`;

    return normalizeBashCodeInput({
        id: `${base}-terminal-task-${index}`,
        kind: "code_input",
        title: `Prepare terminal workspace ${index}`,
        prompt:
            `Create a folder named ${workspaceName}, then create ${notePath} as the marker file for ${topicTitle}.`,
        hint: `Use mkdir -p ${workspaceName}, then touch ${notePath}.`,
        help: commonHelp(topicTitle),
        starterCode: "# Use the terminal for this Linux task.\n",
        fixedLanguage: "bash",
        recipeType: "shell_task",
        mode: "terminal_workspace",
        entryFilePath: "main.sh",
        solutionCode: `mkdir -p ${workspaceName}\ntouch ${notePath}\n`,
        instructions:
            `Create ${workspaceName} and ${notePath} in the terminal workspace.`,
        workspaceExpectations: {
            requiredFolders: [workspaceName],
            requiredFiles: [notePath],
        },
        terminalExpectations: {
            forbiddenCommands: forbiddenSudoExpectation(),
        },
    });
}

export async function repairBashDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    draft: TopicAuthoringDraft;
    report: RepairReport;
}> {
    const repaired = repairDraftToPlannedExerciseCounts({
        seed: args.seed,
        draft: args.draft,
        repairCodePrefix: "BASH_EXERCISE_POLICY",
        normalizeCodeInput: normalizeBashCodeInput,
        makeCodeInputFallback: makeBashCodeInputFallback,
    });

    const codeInputs = repaired.draft.quizDraft.filter(
        (exercise): exercise is CodeInputDraft => exercise.kind === "code_input",
    );

    if (codeInputs.length < 1) {
        const { projectDraft: _projectDraft, ...draftWithoutProject } = repaired.draft;
        return {
            draft: draftWithoutProject,
            report: repaired.report,
        };
    }

    return {
        draft: {
            ...repaired.draft,
            projectDraft: {
                title:
                    repaired.draft.projectDraft?.title ||
                    `${args.seed.title || "Linux"} terminal workspace practice`,
                stepIds: codeInputs.map((exercise) => exercise.id),
            },
        },
        report: repaired.report,
    };
}
