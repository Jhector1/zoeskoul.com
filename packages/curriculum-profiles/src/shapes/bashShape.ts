import { createTerminalShape } from "../terminal/createTerminalShape.js";

export const bashShape = createTerminalShape({
    profileId: "bash",
    genKey: "bash_course",
    moduleSlug: (order) => `bash-${order}`,
    modulePrefix: (order) => `sh${order}`,
    sectionSlug: (moduleOrder, sectionOrder) =>
        `bash-${moduleOrder}-terminal-workspace-${sectionOrder}`,
    aiDescription:
        "Bash/Linux draft content compiles into terminal-first topic bundles and message files.",
    aiRules: [
        "Use existing Bash/Linux key namespaces.",
        "Use only sketch/project/quiz cards.",
        "Use paragraph sketches.",
        'Use code_input with recipeType "shell_task" for Linux terminal exercises.',
        'Use mode "terminal_workspace" for Course 1 Linux labs unless the authoring explicitly asks for another shell_task mode.',
        "Keep learner-facing wording about Linux or the Linux Terminal, not Bash as a course title.",
    ],
});
