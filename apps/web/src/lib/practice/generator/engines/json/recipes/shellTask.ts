import { makeCodeInputOut, starterCodeForGeneratedExercise } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { mergeLearningIdeConfigs } from "@/lib/ide/learningIdeConfig";
import { makeShellTaskExpected } from "@zoeskoul/practice-checks";

export const buildShellTaskRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const terminalWorkspaceIdeConfig =
        def.recipe?.mode === "terminal_workspace"
            ? {
                runnerBackend: "pty" as const,
                layoutMode: "terminal_workspace" as const,
                /**
                 * Shell-task quiz items must start from the exercise starter
                 * workspace. Topic-scoped PTY reuse can leak files from another
                 * exercise/tool session, e.g. `main.py` inside a Linux task.
                 */
                terminalSessionScope: "topic" as const,
                fileActions: {
                    enabled: false,
                },
                requires: {
                    files: true,
                    multiFile: true,
                    terminal: true,
                },
            }
            : null;

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language: "bash",
        starterCode: starterCodeForGeneratedExercise(
            def.starterCode,
            resolved.starterCode,
        ),
        workspace: def.workspace,
        starterFiles: def.starterFiles,
        files: (def as any).files ?? def.workspace?.files,
        initialFiles: (def as any).initialFiles ?? def.workspace?.initialFiles,
        workspaceFiles: (def as any).workspaceFiles ?? def.workspace?.workspaceFiles,
        fixtureFiles: (def as any).fixtureFiles ?? (def.workspace as any)?.fixtureFiles,
        fixtures: (def as any).fixtures ?? (def.workspace as any)?.fixtures,
        fileFixtures: (def as any).fileFixtures ?? (def.workspace as any)?.fileFixtures,
        initialStdin: def.initialStdin,
        entryFile:
            def.entryFile ??
            def.workspace?.entryFile ??
            def.workspace?.entryFilePath ??
            def.workspace?.mainFile ??
            def.workspace?.mainFilePath,
        help: resolved.help,
        hint: resolved.hint,
        expected: makeShellTaskExpected({
            mode: def.recipe?.mode ?? "terminal_workspace",
            workspaceExpectations:
                def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
            terminalExpectations: (def as any).terminalExpectations,
            hiddenShellCheck: (def as any).hiddenShellCheck,
            sourceChecks: (def as any).sourceChecks,
        }) as any,
        expectedExample: null,
        ideConfig: mergeLearningIdeConfigs(
            terminalWorkspaceIdeConfig,
            def.serviceOverrides ?? null,
        ),
    });
};
