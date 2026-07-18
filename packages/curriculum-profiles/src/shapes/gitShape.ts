import { createTerminalShape } from "../terminal/createTerminalShape.js";

export const gitShape = createTerminalShape({
    profileId: "git",
    genKey: "git_course",
    moduleSlug: (order) => `git-${order}`,
    modulePrefix: (order) => `git${order}`,
    sectionSlug: (moduleOrder, sectionOrder) =>
        `git-${moduleOrder}-repository-workflow-${sectionOrder}`,
    aiDescription:
        "Git draft content compiles into terminal-first repository labs and message files.",
    aiRules: [
        "Use existing Git key namespaces.",
        "Use only sketch/project/quiz cards.",
        "Use paragraph sketches.",
        'Use code_input with recipeType "shell_task" and mode "terminal_workspace" for Git labs.',
        'Keep fixedLanguage and runtime language exactly "bash" because Git commands run in the terminal.',
        "Grade repository state with gitExpectations instead of exact command output or commit hashes.",
        "Do not require public network access, GitHub credentials, or learner secrets.",
    ],
});
