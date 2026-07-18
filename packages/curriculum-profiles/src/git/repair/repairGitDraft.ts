import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { RepairEntry, RepairReport } from "../../shared/profileServices.js";
import {
    makePolicyRepair,
    repairDraftToPlannedExerciseCounts,
    type CodeInputDraft,
    type DraftExercise,
} from "../../shared/repairExercisePolicyDraft.js";

const SETUP_PATH = ".zoeskoul/setup.sh";
const ENTRY_PATH = "main.sh";

function safeSlug(value: string): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "git-topic";
}

function unique(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function commandPattern(command: string): string {
    return `^${command
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+")}$`;
}

function exerciseText(exercise: DraftExercise): string {
    return [
        exercise.title,
        exercise.prompt,
        exercise.hint,
        exercise.help?.concept,
        exercise.help?.hint_1,
        exercise.help?.hint_2,
    ]
        .filter(Boolean)
        .join("\n");
}

function inlineCode(text: string): string[] {
    return [...text.matchAll(/`([^`\r\n]+)`/g)].map((match) => match[1].trim());
}

function extractGitCommands(exercise: DraftExercise): string[] {
    return unique(
        inlineCode(exerciseText(exercise))
            .map((value) => value.replace(/[.,;:]+$/g, "").trim())
            .filter((value) => /^git(?:\s|$)/.test(value)),
    );
}

function extractWorkspaceFiles(exercise: DraftExercise): string[] {
    return unique(
        inlineCode(exerciseText(exercise)).filter((value) => {
            if (/^git(?:\s|$)/.test(value)) return false;
            if (value.startsWith("-") || value.includes(" ")) return false;
            return /(?:^|\/)[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+$/.test(value);
        }),
    );
}

function inferGitCommand(seed: TopicSeed, exercise: DraftExercise): string {
    const text = `${seed.topicId} ${exerciseText(exercise)}`.toLowerCase();
    const file = extractWorkspaceFiles(exercise)[0] ?? "practice.txt";

    if (text.includes("check-ignore") || text.includes("ignored")) {
        return `git check-ignore ${file}`;
    }
    if (text.includes("restore --staged") || text.includes("unstage")) {
        return `git restore --staged ${file}`;
    }
    if (text.includes("restore")) return `git restore ${file}`;
    if (text.includes("git diff") || text.includes("unstaged changes")) {
        return "git diff";
    }
    if (text.includes("git show") || text.includes("show a commit")) {
        return "git show --stat --oneline HEAD";
    }
    if (text.includes("history") || text.includes("git log")) {
        return "git log --oneline";
    }
    if (text.includes("stage") || text.includes("git add")) {
        return `git add ${file}`;
    }
    if (text.includes("commit")) {
        return `git commit -m "Complete ${safeSlug(exercise.title || seed.title || seed.topicId)}"`;
    }
    if (text.includes("initialize") || text.includes("git init")) {
        return "git init -b main";
    }
    if (text.includes("branch") && (text.includes("create") || text.includes("switch"))) {
        return "git switch -c practice-branch";
    }
    if (text.includes("branch") && text.includes("delete")) {
        return "git branch -d practice-branch";
    }
    if (text.includes("merge") && text.includes("abort")) {
        return "git merge --abort";
    }
    if (text.includes("merge")) return "git merge practice-branch";
    if (text.includes("revert")) return "git revert --no-edit HEAD";
    if (text.includes("stash")) return 'git stash push -m "Pause practice work"';
    if (text.includes("reflog")) return "git reflog";
    if (text.includes("remote") || text.includes("origin")) return "git remote -v";
    if (text.includes("fetch")) return "git fetch origin";
    if (text.includes("pull")) return "git pull --ff-only";
    if (text.includes("push")) return "git push -u origin main";
    if (text.includes("clone")) return "git clone ../origin.git practice-clone";
    return "git status";
}

function requiredCommands(
    commands: string[],
): NonNullable<CodeInputDraft["terminalExpectations"]> {
    return {
        requiredCommands: unique(commands).map((command) => ({
            pattern: commandPattern(command),
        })),
        forbiddenCommands: [
            {
                pattern: "git\\s+reset\\s+--hard|git\\s+push\\s+--force(?:-with-lease)?",
                message: "Do not rewrite shared history in this Git practice task.",
            },
        ],
    };
}

function setupFile(content: string) {
    return {
        path: SETUP_PATH,
        content,
        language: "bash",
        readOnly: true,
    };
}

function entryFile(content: string, solution = false) {
    return {
        path: ENTRY_PATH,
        content,
        language: "bash",
        isEntry: true,
        entry: true,
        ...(solution ? {} : { readOnly: false }),
    };
}

function commonSetup(body: string): string {
    return [
        "#!/usr/bin/env bash",
        "set -eu",
        'git init -q -b main',
        'git config user.name "ZoeSkoul Learner"',
        'git config user.email "learner@zoeskoul.local"',
        "printf '.zoeskoul/\nmain.sh\n' >> .git/info/exclude",
        body.trim(),
        "",
    ].join("\n");
}

function workingTreeFallback(args: {
    seed: TopicSeed;
    exercise: DraftExercise;
    index: number;
}): CodeInputDraft {
    const file = extractWorkspaceFiles(args.exercise)[0] ?? "project.txt";
    const starterCode = [
        `# First type: bash ${SETUP_PATH}`,
        "# Press Enter, then type the Git command requested in the prompt.",
        "",
    ].join("\n");

    const variants = [
        {
            setup: commonSetup([
                `printf 'Project baseline\\n' > ${file}`,
                `git add ${file}`,
                'git commit -q -m "Add project baseline"',
                `printf 'Working tree update\\n' >> ${file}`,
            ].join("\n")),
            commands: ["git status"],
            gitExpectations: {
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 1,
                cleanWorkingTree: false,
                trackedFiles: [file],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
        {
            setup: commonSetup([
                `printf 'Project baseline\\n' > ${file}`,
                `git add ${file}`,
                'git commit -q -m "Add project baseline"',
                `printf 'Ready to stage\\n' >> ${file}`,
            ].join("\n")),
            commands: [`git add ${file}`, "git status"],
            gitExpectations: {
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 1,
                cleanWorkingTree: false,
                trackedFiles: [file],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: {
                script: `git diff --cached --name-only | grep -Fxq -- ${JSON.stringify(file)}`,
                timeoutMs: 5000,
            } satisfies NonNullable<CodeInputDraft["hiddenShellCheck"]>,
        },
        {
            setup: commonSetup([
                `printf 'Project baseline\\n' > ${file}`,
                `git add ${file}`,
                'git commit -q -m "Add project baseline"',
                `printf 'Ready to commit\\n' >> ${file}`,
                `git add ${file}`,
            ].join("\n")),
            commands: ['git commit -m "Update project file"', "git log --oneline"],
            gitExpectations: {
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 2,
                cleanWorkingTree: true,
                trackedFiles: [file],
                commitMessages: [
                    { position: 0, matches: "^Update project file$" },
                ],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
        {
            setup: commonSetup([
                `printf 'First project note\\n' > ${file}`,
                `git add ${file}`,
                'git commit -q -m "Add first project note"',
                `printf 'Second project note\\n' >> ${file}`,
                `git add ${file}`,
                'git commit -q -m "Add second project note"',
            ].join("\n")),
            commands: ["git log --oneline"],
            gitExpectations: {
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 2,
                cleanWorkingTree: true,
                trackedFiles: [file],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
    ] as const;

    const variant = variants[Math.max(0, Math.min(args.index - 1, variants.length - 1))];
    const solutionCode = [`bash ${SETUP_PATH}`, ...variant.commands, ""].join("\n");
    const prompt = [
        args.exercise.prompt || args.exercise.title || "Complete the Git repository task.",
        `This practice opens in a fresh workspace. First type \`bash ${SETUP_PATH}\` and press Enter to prepare the local repository. Then type the requested Git command and press Enter.`,
    ].join("\n\n");

    return {
        id: args.exercise.id,
        kind: "code_input",
        title: args.exercise.title || `Git repository practice ${args.index}`,
        prompt,
        hint: args.exercise.hint || "Inspect the repository state before choosing the Git command.",
        help: args.exercise.help,
        starterCode,
        solutionCode,
        fixedLanguage: "bash",
        recipeType: "shell_task",
        mode: "terminal_workspace",
        entryFilePath: ENTRY_PATH,
        instructions: prompt,
        starterFiles: [entryFile(starterCode), setupFile(variant.setup)],
        solutionFiles: [entryFile(solutionCode, true), setupFile(variant.setup)],
        terminalExpectations: requiredCommands([
            `bash ${SETUP_PATH}`,
            ...variant.commands,
        ]),
        gitExpectations: variant.gitExpectations,
        ...(variant.hiddenShellCheck
            ? { hiddenShellCheck: variant.hiddenShellCheck }
            : {}),
    };
}

function directorySetup(
    directory: string,
    options: {
        initialize?: boolean;
        configureIdentity?: boolean;
        files?: Array<{ path: string; content: string }>;
    } = {},
): string {
    const quotedDirectory = JSON.stringify(directory);
    const lines = [
        "#!/usr/bin/env bash",
        "set -eu",
        `rm -rf -- ${quotedDirectory}`,
        `mkdir -p -- ${quotedDirectory}`,
    ];

    if (options.initialize) {
        lines.push(`git -C ${quotedDirectory} init -q -b main`);
        if (options.configureIdentity !== false) {
            lines.push(
                `git -C ${quotedDirectory} config user.name "ZoeSkoul Learner"`,
                `git -C ${quotedDirectory} config user.email "learner@zoeskoul.local"`,
            );
        }
    }

    for (const file of options.files ?? []) {
        lines.push(
            `printf %s ${JSON.stringify(file.content)} > ${JSON.stringify(
                `${directory}/${file.path}`,
            )}`,
        );
    }

    lines.push("");
    return lines.join("\n");
}

function configureAndInitializeFallback(args: {
    seed: TopicSeed;
    exercise: DraftExercise;
    index: number;
}): CodeInputDraft {
    const variants = [
        {
            prompt: [
                "Initialize a new Git repository in the `project_alpha` directory with `main` as its initial branch.",
                `First type \`bash ${SETUP_PATH}\` and press Enter to create the empty directory. Then enter the directory, initialize Git with the requested branch name, and press Enter after each command.`,
            ].join("\n\n"),
            hint: "Create the repository only after entering project_alpha, and include the initial-branch option during initialization.",
            help: {
                concept: "git init creates the hidden repository metadata that turns an ordinary directory into a Git working repository.",
                hint_1: "The repository belongs inside project_alpha rather than at the workspace root.",
                hint_2: "Initialize the repository with main as the initial branch in the same command.",
            },
            setup: directorySetup("project_alpha"),
            solutionCommands: ["cd project_alpha", "git init -b main"],
            evidenceCommands: [`bash ${SETUP_PATH}`, "git init -b main"],
            gitExpectations: {
                repositoryPath: "project_alpha",
                repositoryInitialized: true,
                currentBranch: "main",
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
        {
            prompt: [
                "Inspect the repository metadata in `project_beta` and confirm which branch `HEAD` points to.",
                `First type \`bash ${SETUP_PATH}\` and press Enter. Enter project_beta, type \`ls .git\` and press Enter, then type \`cat .git/HEAD\` and press Enter. The final output should show \`ref: refs/heads/main\`.`,
            ].join("\n\n"),
            hint: "The .git directory stores repository metadata, while .git/HEAD names the currently checked-out branch reference.",
            help: {
                concept: "HEAD is a small reference file that identifies the branch currently checked out in the repository.",
                hint_1: "List .git first so you can see the metadata files Git created.",
                hint_2: "Read .git/HEAD to reveal the refs/heads/main reference.",
            },
            setup: directorySetup("project_beta", { initialize: true }),
            solutionCommands: ["cd project_beta", "ls .git", "cat .git/HEAD"],
            evidenceCommands: [
                `bash ${SETUP_PATH}`,
                "ls .git",
                "cat .git/HEAD",
            ],
            gitExpectations: {
                repositoryPath: "project_beta",
                repositoryInitialized: true,
                currentBranch: "main",
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
        {
            prompt: [
                "Inspect the status of `project_gamma` and identify its untracked file.",
                `First type \`bash ${SETUP_PATH}\` and press Enter. Enter project_gamma, type \`git status --short\`, and press Enter. The output should include \`?? launch-notes.txt\`.`,
            ].join("\n\n"),
            hint: "The short status format marks an untracked file with two question marks.",
            help: {
                concept: "git status compares the working tree with Git's index and history so untracked files are visible before staging.",
                hint_1: "Use the short form to reduce the result to a compact status code and file name.",
                hint_2: "Look for the ?? marker beside launch-notes.txt.",
            },
            setup: directorySetup("project_gamma", {
                initialize: true,
                files: [
                    {
                        path: "launch-notes.txt",
                        content: "Draft launch checklist\n",
                    },
                ],
            }),
            solutionCommands: ["cd project_gamma", "git status --short"],
            evidenceCommands: [`bash ${SETUP_PATH}`, "git status --short"],
            gitExpectations: {
                repositoryPath: "project_gamma",
                repositoryInitialized: true,
                currentBranch: "main",
                cleanWorkingTree: false,
                untrackedFiles: ["launch-notes.txt"],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
        {
            prompt: [
                "Configure a repository-only Git identity in `project_delta` using the name `ZoeSkoul Learner` and email `learner@zoeskoul.local`.",
                `First type \`bash ${SETUP_PATH}\` and press Enter. Enter project_delta, run each local Git configuration command, and press Enter after each one.`,
            ].join("\n\n"),
            hint: "Use repository-local configuration so the practice does not change the machine's global Git identity.",
            help: {
                concept: "Local Git configuration stores author identity inside one repository and overrides global values only there.",
                hint_1: "Set user.name and user.email with the local scope after entering project_delta.",
                hint_2: "Use the exact name and email shown in the task.",
            },
            setup: directorySetup("project_delta", {
                initialize: true,
                configureIdentity: false,
            }),
            solutionCommands: [
                "cd project_delta",
                'git config --local user.name "ZoeSkoul Learner"',
                'git config --local user.email "learner@zoeskoul.local"',
            ],
            evidenceCommands: [
                `bash ${SETUP_PATH}`,
                'git config --local user.name "ZoeSkoul Learner"',
                'git config --local user.email "learner@zoeskoul.local"',
            ],
            gitExpectations: {
                repositoryPath: "project_delta",
                repositoryInitialized: true,
                currentBranch: "main",
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: {
                script: [
                    'test "$(git -C project_delta config --local user.name)" = "ZoeSkoul Learner"',
                    'test "$(git -C project_delta config --local user.email)" = "learner@zoeskoul.local"',
                ].join(" && "),
                timeoutMs: 5000,
            } satisfies NonNullable<CodeInputDraft["hiddenShellCheck"]>,
        },
    ] as const;

    const variant =
        variants[Math.max(0, Math.min(args.index - 1, variants.length - 1))];
    const starterCode = [
        `# First type: bash ${SETUP_PATH}`,
        "# Press Enter, then follow the task in the lesson prompt.",
        "",
    ].join("\n");
    const solutionCode = [
        `bash ${SETUP_PATH}`,
        ...variant.solutionCommands,
        "",
    ].join("\n");

    return {
        id: args.exercise.id,
        kind: "code_input",
        title: args.exercise.title || `Repository setup practice ${args.index}`,
        prompt: variant.prompt,
        hint: variant.hint,
        help: variant.help,
        starterCode,
        solutionCode,
        fixedLanguage: "bash",
        recipeType: "shell_task",
        mode: "terminal_workspace",
        entryFilePath: ENTRY_PATH,
        instructions: variant.prompt,
        starterFiles: [entryFile(starterCode), setupFile(variant.setup)],
        solutionFiles: [entryFile(solutionCode, true), setupFile(variant.setup)],
        terminalExpectations: requiredCommands([...variant.evidenceCommands]),
        gitExpectations: variant.gitExpectations,
        ...(variant.hiddenShellCheck
            ? { hiddenShellCheck: variant.hiddenShellCheck }
            : {}),
    };
}


function neighborhoodGuideSetup(completedStep: number): string {
    const lines = [
        "#!/usr/bin/env bash",
        "set -eu",
        'rm -rf -- "resource-guide"',
        'mkdir -p -- "resource-guide/pages" "resource-guide/notes" "resource-guide/generated"',
        `printf '%s\\n' '# Neighborhood Resource Guide' '' 'Welcome to the neighborhood resource guide.' > "resource-guide/README.md"`,
        `printf '%s\\n' '# Contact Information' '' 'Help Desk Hours: 9 AM - 4 PM, Monday to Friday' > "resource-guide/pages/contact.md"`,
        `printf '%s\\n' '# Guide Draft' '' 'Use this page to find neighborhood help.' > "resource-guide/pages/guide-draft.md"`,
        `printf '%s\\n' 'Legacy volunteer phone tree' > "resource-guide/notes/old-phone-tree.txt"`,
    ];

    if (completedStep >= 1) {
        lines.push(
            'git -C "resource-guide" init -q -b main',
            'git -C "resource-guide" config user.name "ZoeSkoul Learner"',
            'git -C "resource-guide" config user.email "learner@zoeskoul.local"',
            'git -C "resource-guide" add README.md pages/contact.md pages/guide-draft.md notes/old-phone-tree.txt',
            'git -C "resource-guide" commit -q -m "Start neighborhood resource guide"',
        );
    }

    if (completedStep >= 2) {
        lines.push(
            `printf '%s\\n' '# Local Services' '' '- Community pantry' '- Senior transport' > "resource-guide/pages/services.md"`,
            'git -C "resource-guide" add pages/services.md',
            'git -C "resource-guide" commit -q -m "Add local services page"',
        );
    }

    if (completedStep >= 3) {
        lines.push(
            `printf '%s\\n' '# Contact Information' '' 'Help Desk Hours: 9 AM - 5 PM, Monday to Friday' > "resource-guide/pages/contact.md"`,
            'git -C "resource-guide" add pages/contact.md',
            'git -C "resource-guide" commit -q -m "Update help desk hours"',
            `printf '%s\\n' '<html>generated preview</html>' > "resource-guide/generated/preview.html"`,
        );
    }

    if (completedStep >= 4) {
        lines.push(
            `printf '%s\\n' 'generated/' > "resource-guide/.gitignore"`,
            'git -C "resource-guide" add .gitignore',
        );
    }

    if (completedStep >= 5) {
        lines.push(
            'git -C "resource-guide" mv pages/guide-draft.md pages/getting-help.md',
            'git -C "resource-guide" rm -q notes/old-phone-tree.txt',
        );
    }

    lines.push("");
    return lines.join("\n");
}

function finalNeighborhoodResourceGuideFallback(args: {
    seed: TopicSeed;
    exercise: DraftExercise;
    index: number;
}): CodeInputDraft {
    const variants = [
        {
            title: "Create the Guide Baseline",
            prompt: [
                "Turn the existing `resource-guide/` folder into a Git repository on `main`, configure the repository-only learner identity, stage the initial guide files, and commit `Start neighborhood resource guide`.",
                `First type \`bash ${SETUP_PATH}\` and press Enter. Then enter \`resource-guide/\`, type each Git command, and press Enter after every command.`,
            ].join("\n\n"),
            hint: "Initialize on main, set the local name and email, then stage only the authored baseline files before committing.",
            help: {
                concept: "The first capstone step converts an ordinary project folder into a repository with a trustworthy baseline commit.",
                hint_1: "Use repository-local identity values ZoeSkoul Learner and learner@zoeskoul.local.",
                hint_2: "Commit README.md, the two starting pages, and the obsolete note with the exact baseline message.",
            },
            setupStep: 0,
            commands: [
                "cd resource-guide",
                "git init -b main",
                'git config --local user.name "ZoeSkoul Learner"',
                'git config --local user.email "learner@zoeskoul.local"',
                "git add README.md pages/contact.md pages/guide-draft.md notes/old-phone-tree.txt",
                'git commit -m "Start neighborhood resource guide"',
            ],
            gitExpectations: {
                repositoryPath: "resource-guide",
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 1,
                cleanWorkingTree: true,
                trackedFiles: [
                    "README.md",
                    "pages/contact.md",
                    "pages/guide-draft.md",
                    "notes/old-phone-tree.txt",
                ],
                commitMessages: [
                    { position: 0, matches: "^Start neighborhood resource guide$" },
                ],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
        {
            title: "Add the Services Page",
            prompt: [
                "Continue the same guide by creating `pages/services.md` with the authored local-services list, stage only that file, and commit `Add local services page`.",
                `First type \`bash ${SETUP_PATH}\` and press Enter to restore the completed baseline. Then enter \`resource-guide/\`, create the page, run the Git commands, and press Enter after each command.`,
            ].join("\n\n"),
            hint: "Keep the baseline commit unchanged and make the services page its own focused commit.",
            help: {
                concept: "A focused commit groups one meaningful change so future maintainers can understand and review it independently.",
                hint_1: "Write the Local Services heading and the two authored service entries.",
                hint_2: "Stage pages/services.md by itself before using the exact commit message.",
            },
            setupStep: 1,
            commands: [
                "cd resource-guide",
                `printf '%s\\n' '# Local Services' '' '- Community pantry' '- Senior transport' > pages/services.md`,
                "git add pages/services.md",
                'git commit -m "Add local services page"',
            ],
            gitExpectations: {
                repositoryPath: "resource-guide",
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 2,
                cleanWorkingTree: true,
                trackedFiles: ["pages/services.md"],
                commitMessages: [
                    { position: 0, matches: "^Add local services page$" },
                    { position: 1, matches: "^Start neighborhood resource guide$" },
                ],
                headFiles: [
                    { path: "pages/services.md", contains: "Community pantry" },
                ],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
        {
            title: "Publish Updated Help Desk Hours",
            prompt: [
                "Change `pages/contact.md` so the help desk closes at 5 PM, inspect the unstaged diff, then commit `Update help desk hours`.",
                `First type \`bash ${SETUP_PATH}\` and press Enter to restore the first two commits. Enter \`resource-guide/\`, update the page, type \`git diff\` and press Enter, then stage and commit the change.`,
            ].join("\n\n"),
            hint: "Inspect the exact 4 PM to 5 PM change before staging it.",
            help: {
                concept: "git diff lets you review a working-tree edit before it becomes part of the next snapshot.",
                hint_1: "Replace only the closing hour in pages/contact.md.",
                hint_2: "After reviewing the diff, stage the contact page and use the exact commit message.",
            },
            setupStep: 2,
            commands: [
                "cd resource-guide",
                `printf '%s\\n' '# Contact Information' '' 'Help Desk Hours: 9 AM - 5 PM, Monday to Friday' > pages/contact.md`,
                "git diff",
                "git add pages/contact.md",
                'git commit -m "Update help desk hours"',
            ],
            gitExpectations: {
                repositoryPath: "resource-guide",
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 3,
                cleanWorkingTree: true,
                trackedFiles: ["pages/contact.md"],
                commitMessages: [
                    { position: 0, matches: "^Update help desk hours$" },
                    { position: 1, matches: "^Add local services page$" },
                    { position: 2, matches: "^Start neighborhood resource guide$" },
                ],
                headFiles: [
                    { path: "pages/contact.md", contains: "9 AM - 5 PM" },
                ],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
        {
            title: "Ignore Generated Preview Files",
            prompt: [
                "Create `.gitignore` with the rule `generated/`, stage `.gitignore`, and verify that `generated/preview.html` is ignored. Do not commit yet; this staged rule belongs with the final cleanup commit.",
                `First type \`bash ${SETUP_PATH}\` and press Enter to restore the three committed milestones. Enter \`resource-guide/\`, type each command, and press Enter after every command.`,
            ].join("\n\n"),
            hint: "The ignore rule must be staged while the generated preview remains untracked and ignored.",
            help: {
                concept: ".gitignore records which generated artifacts Git should leave outside the maintained history.",
                hint_1: "Write generated/ on its own line and stage only .gitignore.",
                hint_2: "Use git check-ignore generated/preview.html to prove the rule applies.",
            },
            setupStep: 3,
            commands: [
                "cd resource-guide",
                `printf '%s\\n' 'generated/' > .gitignore`,
                "git add .gitignore",
                "git check-ignore generated/preview.html",
            ],
            gitExpectations: {
                repositoryPath: "resource-guide",
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 3,
                cleanWorkingTree: false,
                trackedFiles: [".gitignore"],
                ignoredFiles: ["generated/preview.html"],
                forbiddenTrackedFiles: ["generated/preview.html"],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: {
                script: 'git -C resource-guide diff --cached --name-only | grep -Fxq -- .gitignore',
                timeoutMs: 5000,
            } satisfies NonNullable<CodeInputDraft["hiddenShellCheck"]>,
        },
        {
            title: "Rename the Guide and Remove the Obsolete Note",
            prompt: [
                "Use Git-aware file operations to rename `pages/guide-draft.md` to `pages/getting-help.md` and remove `notes/old-phone-tree.txt`. Keep these staged changes together with the staged `.gitignore`; do not commit yet.",
                `First type \`bash ${SETUP_PATH}\` and press Enter to restore the staged ignore rule. Enter \`resource-guide/\`, type \`git mv\` and press Enter, then type \`git rm\` and press Enter.`,
            ].join("\n\n"),
            hint: "Use git mv and git rm so the index records the rename and deletion for the final commit.",
            help: {
                concept: "Git-aware rename and removal commands update both the working tree and staging area in one deliberate step.",
                hint_1: "Rename the draft page to pages/getting-help.md.",
                hint_2: "Remove notes/old-phone-tree.txt without committing the staged cleanup yet.",
            },
            setupStep: 4,
            commands: [
                "cd resource-guide",
                "git mv pages/guide-draft.md pages/getting-help.md",
                "git rm notes/old-phone-tree.txt",
            ],
            gitExpectations: {
                repositoryPath: "resource-guide",
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 3,
                cleanWorkingTree: false,
                trackedFiles: [".gitignore", "pages/getting-help.md"],
                ignoredFiles: ["generated/preview.html"],
                forbiddenTrackedFiles: [
                    "generated/preview.html",
                    "pages/guide-draft.md",
                    "notes/old-phone-tree.txt",
                ],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: {
                script: [
                    'git -C resource-guide diff --cached --name-status | grep -Eq "^R[0-9]*[[:space:]]+pages/guide-draft.md[[:space:]]+pages/getting-help.md$"',
                    'git -C resource-guide diff --cached --name-status | grep -Eq "^D[[:space:]]+notes/old-phone-tree.txt$"',
                ].join(" && "),
                timeoutMs: 5000,
            } satisfies NonNullable<CodeInputDraft["hiddenShellCheck"]>,
        },
        {
            title: "Commit and Verify the Final Handoff",
            prompt: [
                "Commit the staged ignore rule, tracked rename, and obsolete-note removal with `Prepare resource guide handoff`. Then inspect the four-commit history and confirm the working tree is clean.",
                `First type \`bash ${SETUP_PATH}\` and press Enter to restore all staged cleanup changes. Enter \`resource-guide/\`, commit them, then type the verification commands and press Enter after each one.`,
            ].join("\n\n"),
            hint: "The final commit should leave exactly four commits and no remaining tracked or untracked changes except the ignored preview.",
            help: {
                concept: "A handoff check confirms that the intended files are in HEAD, generated output stays ignored, obsolete paths are gone, and history is easy to read.",
                hint_1: "Use the exact final commit message before inspecting git log --oneline.",
                hint_2: "Finish with git status --short; a clean result prints no lines.",
            },
            setupStep: 5,
            commands: [
                "cd resource-guide",
                'git commit -m "Prepare resource guide handoff"',
                "git log --oneline",
                "git status --short",
            ],
            gitExpectations: {
                repositoryPath: "resource-guide",
                repositoryInitialized: true,
                currentBranch: "main",
                exactCommitCount: 4,
                cleanWorkingTree: true,
                trackedFiles: [
                    ".gitignore",
                    "README.md",
                    "pages/contact.md",
                    "pages/getting-help.md",
                    "pages/services.md",
                ],
                ignoredFiles: ["generated/preview.html"],
                forbiddenTrackedFiles: [
                    "generated/preview.html",
                    "pages/guide-draft.md",
                    "notes/old-phone-tree.txt",
                ],
                commitMessages: [
                    { position: 0, matches: "^Prepare resource guide handoff$" },
                    { position: 1, matches: "^Update help desk hours$" },
                    { position: 2, matches: "^Add local services page$" },
                    { position: 3, matches: "^Start neighborhood resource guide$" },
                ],
                headFiles: [
                    { path: "pages/contact.md", contains: "9 AM - 5 PM" },
                    { path: "pages/getting-help.md", contains: "neighborhood help" },
                    { path: "pages/services.md", contains: "Community pantry" },
                    { path: ".gitignore", equals: "generated/\n" },
                ],
            } satisfies NonNullable<CodeInputDraft["gitExpectations"]>,
            hiddenShellCheck: undefined,
        },
    ] as const;

    const variant = variants[Math.max(0, Math.min(args.index - 1, variants.length - 1))];
    const starterCode = [
        `# First type: bash ${SETUP_PATH}`,
        "# Press Enter, then follow the capstone step in the prompt.",
        "",
    ].join("\n");
    const solutionCode = [`bash ${SETUP_PATH}`, ...variant.commands, ""].join("\n");
    const setup = neighborhoodGuideSetup(variant.setupStep);

    return {
        id: args.exercise.id,
        kind: "code_input",
        title: variant.title,
        prompt: variant.prompt,
        hint: variant.hint,
        help: variant.help,
        starterCode,
        solutionCode,
        fixedLanguage: "bash",
        recipeType: "shell_task",
        mode: "terminal_workspace",
        entryFilePath: ENTRY_PATH,
        instructions: variant.prompt,
        starterFiles: [entryFile(starterCode), setupFile(setup)],
        solutionFiles: [entryFile(solutionCode, true), setupFile(setup)],
        terminalExpectations: requiredCommands([
            `bash ${SETUP_PATH}`,
            ...variant.commands.filter((command) => !command.startsWith("cd ")),
        ]),
        gitExpectations: variant.gitExpectations,
        ...(variant.hiddenShellCheck
            ? { hiddenShellCheck: variant.hiddenShellCheck }
            : {}),
    };
}

function genericGitFallback(args: {
    seed: TopicSeed;
    exercise: DraftExercise;
    index: number;
}): CodeInputDraft {
    const extracted = extractGitCommands(args.exercise);
    const targetCommands = extracted.length > 0
        ? extracted
        : [inferGitCommand(args.seed, args.exercise)];
    const file = extractWorkspaceFiles(args.exercise)[0] ?? `practice-${args.index}.txt`;
    const setup = commonSetup(`printf 'Git practice file ${args.index}\\n' > ${file}`);
    const starterCode = [
        `# First type: bash ${SETUP_PATH}`,
        "# Press Enter, then complete the requested Git task.",
        "",
    ].join("\n");
    const solutionCode = [`bash ${SETUP_PATH}`, ...targetCommands, ""].join("\n");
    const prompt = [
        args.exercise.prompt || args.exercise.title || "Complete the Git repository task.",
        `This practice opens in a fresh workspace. First type \`bash ${SETUP_PATH}\` and press Enter, then type each requested Git command and press Enter.`,
    ].join("\n\n");

    return {
        id: args.exercise.id,
        kind: "code_input",
        title: args.exercise.title || `Git repository practice ${args.index}`,
        prompt,
        hint: args.exercise.hint || "Use the repository state and the exact names from the prompt.",
        help: args.exercise.help,
        starterCode,
        solutionCode,
        fixedLanguage: "bash",
        recipeType: "shell_task",
        mode: "terminal_workspace",
        entryFilePath: ENTRY_PATH,
        instructions: prompt,
        starterFiles: [entryFile(starterCode), setupFile(setup)],
        solutionFiles: [entryFile(solutionCode, true), setupFile(setup)],
        terminalExpectations: requiredCommands([
            `bash ${SETUP_PATH}`,
            ...targetCommands,
        ]),
        gitExpectations: {
            repositoryInitialized: true,
            currentBranch: "main",
        },
    };
}

function promoteTryIt(args: {
    seed: TopicSeed;
    exercise: DraftExercise;
    index: number;
}): CodeInputDraft {
    if (args.seed.topicId === "working-tree-staging-and-history") {
        return workingTreeFallback(args);
    }
    if (args.seed.topicId === "configure-and-initialize-a-repository") {
        return configureAndInitializeFallback(args);
    }
    if (args.seed.topicId === "final-neighborhood-resource-guide-history") {
        return finalNeighborhoodResourceGuideFallback(args);
    }
    return genericGitFallback(args);
}


const DETERMINISTIC_TOPIC_FALLBACKS = new Set([
    "working-tree-staging-and-history",
    "configure-and-initialize-a-repository",
    "final-neighborhood-resource-guide-history",
]);

function shouldUseDeterministicTopicFallback(
    seed: TopicSeed,
    exercise: DraftExercise,
): boolean {
    return (
        DETERMINISTIC_TOPIC_FALLBACKS.has(seed.topicId) &&
        exercise.id.startsWith(`try-${safeSlug(seed.topicId)}-sketch`)
    );
}

function hasLineByLineExplanation(value: string): boolean {
    return (
        /\bline by line\b/i.test(value) ||
        /\beach line\b/i.test(value) ||
        /\bfirst line\b/i.test(value) ||
        /\bsecond line\b/i.test(value) ||
        /\bstep by step\b/i.test(value)
    );
}

function firstMultilineFence(value: string): string[] | undefined {
    const fencePattern = /```(?:[a-zA-Z0-9_-]+)?[^\S\r\n]*\r?\n([\s\S]*?)```/g;
    for (const match of value.matchAll(fencePattern)) {
        const lines = String(match[1] ?? "")
            .split(/\r?\n/)
            .map((line) => line.trim().replace(/^\$\s*/, ""))
            .filter((line) => line && !line.startsWith("#"));
        if (lines.length >= 2) return lines;
    }
    return undefined;
}

function explainGitExampleLine(command: string, index: number): string {
    const ordinal = ["first", "second", "third", "fourth"][index] ?? `next`;

    if (/^git\s+config\b.*user\.name/.test(command)) {
        return `The ${ordinal} line stores the commit author name in this repository's local Git configuration.`;
    }
    if (/^git\s+config\b.*user\.email/.test(command)) {
        return `The ${ordinal} line stores the matching author email in the same local configuration.`;
    }
    if (/^git\s+init\b/.test(command)) {
        return `The ${ordinal} line creates the repository metadata that lets Git track this directory.`;
    }
    if (/^git\s+status\b/.test(command)) {
        return `The ${ordinal} line asks Git to compare the working tree, staging area, and current history.`;
    }
    if (/^(?:ls\b.*\.git|cat\s+\.git\/HEAD)/.test(command)) {
        return `The ${ordinal} line inspects repository metadata without changing it.`;
    }

    return `The ${ordinal} line runs \`${command}\` as the next repository step in the example.`;
}

function repairGitTeachingSketches(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): {
    draft: TopicAuthoringDraft;
    repairs: RepairEntry[];
} {
    const existingBodies = args.draft.sketchBlocks.map((block) =>
        String(block.bodyMarkdown ?? ""),
    );
    if (existingBodies.some(hasLineByLineExplanation)) {
        return { draft: args.draft, repairs: [] };
    }

    const targetIndex = existingBodies.findIndex((body) =>
        Boolean(firstMultilineFence(body)),
    );
    if (targetIndex < 0) {
        return { draft: args.draft, repairs: [] };
    }

    const lines = firstMultilineFence(existingBodies[targetIndex]);
    if (!lines) {
        return { draft: args.draft, repairs: [] };
    }

    const target = args.draft.sketchBlocks[targetIndex];
    const explanation = [
        "Step by step, read the commands in the order shown.",
        ...lines.map(explainGitExampleLine),
        "Together, the lines form one complete example rather than unrelated commands.",
    ].join(" ");
    const sketchBlocks = args.draft.sketchBlocks.map((block, index) =>
        index === targetIndex
            ? {
                  ...block,
                  bodyMarkdown: `${String(block.bodyMarkdown ?? "").trim()}\n\n${explanation}`,
              }
            : block,
    );

    return {
        draft: { ...args.draft, sketchBlocks },
        repairs: [
            makePolicyRepair({
                code: "GIT_MULTILINE_EXAMPLE_EXPLANATION_ADDED",
                field: `sketchBlocks.${target.id}.bodyMarkdown`,
                severity: "low",
                message: `Added a step-by-step explanation for the multi-line Git example in "${target.id}".`,
            }),
        ],
    };
}

function hasGitGradingEvidence(exercise: CodeInputDraft): boolean {
    return Boolean(
        exercise.gitExpectations ||
            exercise.workspaceExpectations ||
            exercise.terminalExpectations ||
            exercise.hiddenShellCheck ||
            (Array.isArray(exercise.sourceChecks) &&
                exercise.sourceChecks.length > 0),
    );
}

function exerciseSketchIndex(
    exercise: DraftExercise,
    fallbackIndex: number,
): number {
    const match = exercise.id.match(/-sketch(\d+)$/);
    return match ? Number(match[1]) + 1 : fallbackIndex;
}

function needsDeterministicGitWorkspace(exercise: CodeInputDraft): boolean {
    return (
        exercise.recipeType !== "shell_task" ||
        exercise.mode !== "terminal_workspace" ||
        !hasGitGradingEvidence(exercise)
    );
}

function repairMalformedGitCodeInputs(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): {
    draft: TopicAuthoringDraft;
    repairs: RepairEntry[];
} {
    let codeInputIndex = 0;
    const repairs: RepairEntry[] = [];
    const quizDraft = args.draft.quizDraft.map((exercise) => {
        if (exercise.kind !== "code_input") return exercise;

        codeInputIndex += 1;
        const mustUseTopicFallback = shouldUseDeterministicTopicFallback(
            args.seed,
            exercise,
        );
        if (!mustUseTopicFallback && !needsDeterministicGitWorkspace(exercise)) {
            return normalizeGitCodeInput(exercise);
        }

        repairs.push(
            makePolicyRepair({
                code: "GIT_CODE_INPUT_WORKSPACE_REBUILT",
                field: `quizDraft.${exercise.id}`,
                severity: "low",
                message: `Rebuilt generated Git exercise "${exercise.id}" as a self-contained terminal workspace with deterministic setup and grading evidence.`,
            }),
        );

        return promoteTryIt({
            seed: args.seed,
            exercise,
            index: exerciseSketchIndex(exercise, codeInputIndex),
        });
    });

    return {
        draft: { ...args.draft, quizDraft },
        repairs,
    };
}

function normalizeGitCodeInput(exercise: CodeInputDraft): CodeInputDraft {
    const starterCode = exercise.starterCode || "# Use the terminal for this Git task.\n";
    const solutionCode = exercise.solutionCode || "git status\n";
    const entryFilePath = exercise.entryFilePath || ENTRY_PATH;

    return {
        ...exercise,
        fixedLanguage: "bash",
        recipeType: "shell_task",
        mode: "terminal_workspace",
        entryFilePath,
        starterCode,
        solutionCode,
        starterFiles:
            exercise.starterFiles && exercise.starterFiles.length > 0
                ? exercise.starterFiles
                : [entryFile(starterCode)],
        solutionFiles:
            exercise.solutionFiles && exercise.solutionFiles.length > 0
                ? exercise.solutionFiles
                : [entryFile(solutionCode, true)],
    };
}

function promoteMissingGitTryIts(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): {
    draft: TopicAuthoringDraft;
    repairs: RepairEntry[];
} {
    const expected = Math.max(
        0,
        Math.trunc(Number(args.seed.plannedExerciseCounts?.counts.code_input ?? 0)),
    );
    const existing = args.draft.quizDraft.filter(
        (exercise) => exercise.kind === "code_input",
    ).length;
    let remaining = Math.max(0, expected - existing);
    let promotedIndex = existing;
    const repairs: RepairEntry[] = [];

    if (remaining === 0) {
        return { draft: args.draft, repairs };
    }

    const quizDraft = args.draft.quizDraft.map((exercise) => {
        if (
            remaining === 0 ||
            exercise.kind === "code_input" ||
            !exercise.id.startsWith("try-")
        ) {
            return exercise;
        }

        remaining -= 1;
        promotedIndex += 1;
        repairs.push(
            makePolicyRepair({
                code: "GIT_TRY_IT_KIND_PROMOTED",
                field: `quizDraft.${exercise.id}`,
                severity: "low",
                message: `Converted generated Try It "${exercise.id}" into the Git code_input required by plannedExerciseCounts.`,
            }),
        );
        return promoteTryIt({
            seed: args.seed,
            exercise,
            index: promotedIndex,
        });
    });

    return {
        draft: {
            ...args.draft,
            quizDraft,
        },
        repairs,
    };
}

function makeGitCodeInputFallback(seed: TopicSeed, index: number): CodeInputDraft {
    const id = `try-${safeSlug(seed.topicId)}-sketch${Math.max(0, index - 1)}`;
    return promoteTryIt({
        seed,
        index,
        exercise: {
            id,
            kind: "fill_blank_choice",
            title: `${seed.title || seed.topicId} practice ${index}`,
            prompt: `Complete a local Git practice task for ${seed.title || seed.topicId}.`,
            hint: "Inspect the repository, then use the Git command that matches the task.",
            help: {
                concept: `Practice the repository workflow from ${seed.title || seed.topicId}.`,
                hint_1: "Use the exact file or branch names from the prompt.",
                hint_2: "Check repository state before and after the command.",
            },
            template: "The Git practice command is [blank1].",
            choices: ["git status", "git log --oneline"],
            correctValue: "git status",
        },
    });
}

export async function repairGitDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    draft: TopicAuthoringDraft;
    report: RepairReport;
}> {
    const teaching = repairGitTeachingSketches(args);
    // Rebuild malformed authored/model-generated code_input items first. A
    // missing Try It promoted afterward already uses the deterministic Git
    // fallback, so it must not be rebuilt a second time or reported twice.
    const rebuilt = repairMalformedGitCodeInputs({
        seed: args.seed,
        draft: teaching.draft,
    });
    const promoted = promoteMissingGitTryIts({
        seed: args.seed,
        draft: rebuilt.draft,
    });
    const repaired = repairDraftToPlannedExerciseCounts({
        seed: args.seed,
        draft: promoted.draft,
        repairCodePrefix: "GIT_EXERCISE_POLICY",
        normalizeCodeInput: normalizeGitCodeInput,
        makeCodeInputFallback: makeGitCodeInputFallback,
    });

    return {
        draft: repaired.draft,
        report: {
            topicId: args.seed.topicId,
            repairs: [
                ...teaching.repairs,
                ...rebuilt.repairs,
                ...promoted.repairs,
                ...repaired.report.repairs,
            ],
        },
    };
}
