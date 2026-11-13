import { AdminLabFilesystemExpectedSchema } from "@zoeskoul/code-contracts";
import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { mergeLearningIdeConfigs } from "@/lib/ide/learningIdeConfig";
import { makeShellTaskExpected } from "@zoeskoul/practice-checks";

/**
 * The caller may supply this contract only from server-controlled practice
 * authoring. It is deliberately NOT a compiled topic-manifest field.
 * Keeping it outside `def` in the manifest prevents this answer key from
 * appearing in learner-facing exercise metadata.
 */
function resolveShellTaskExpected(def: any) {
    if (!Object.prototype.hasOwnProperty.call(def, "__serverPrivateFilesystemExpected")) {
        return makeShellTaskExpected({
            mode: def.recipe?.mode ?? "terminal_workspace",
            workspaceExpectations:
                def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
            terminalExpectations: def.terminalExpectations,
            hiddenShellCheck: def.hiddenShellCheck,
            sourceChecks: def.sourceChecks,
        });
    }

    const privateContract = def.__serverPrivateFilesystemExpected;
    const contract = privateContract && typeof privateContract === "object" &&
        !Array.isArray(privateContract) ? privateContract : null;
    if (!contract || Object.keys(contract).length !== 1 ||
        !Object.prototype.hasOwnProperty.call(contract, "adminLabFilesystemExpectations")) {
        throw new Error("Invalid private filesystem expected contract.");
    }
    const parsed = AdminLabFilesystemExpectedSchema.safeParse(
        contract.adminLabFilesystemExpectations,
    );
    if (!parsed.success || def.recipe?.type !== "shell_task" ||
        def.recipe?.mode !== "terminal_workspace" || def.language !== "bash") {
        throw new Error("Private filesystem expected requires authorized Bash terminal_workspace.");
    }
    // One authority only. Do not accept a command transcript, workspace
    // assertion, hidden shell check, or stdout as an alternate pass condition.
    const incompatible = [
        "workspaceExpectations", "terminalExpectations", "hiddenShellCheck",
        "sourceChecks", "tests", "semanticChecks",
    ].some((key) => def[key] != null) ||
        def.workspace?.workspaceExpectations != null;
    if (incompatible) {
        throw new Error("Private filesystem expected conflicts with existing shell grading strategy.");
    }
    return {
        kind: "code_input" as const,
        strategy: "programming" as const,
        language: "bash" as const,
        checkMode: "stdout" as const,
        recipeType: "shell_task" as const,
        shellTaskMode: "terminal_workspace" as const,
        adminLabFilesystemExpectations: parsed.data,
    };
}

export const buildShellTaskRecipe: RecipeHandler<any> = (def, args, resolved) => {
    // Never accept a filesystem answer key embedded in the compiled manifest.
    // The only supported ingress is the separate explicit server-private arg.
    if (Object.prototype.hasOwnProperty.call(def, "adminLabFilesystemExpectations")) {
        throw new Error("Filesystem grading contracts must not be embedded in topic manifests.");
    }
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
                /**
                 * Shell-task exercises with starterFiles must start from their own
                 * starter workspace. Cumulative/project tasks can still opt into
                 * topic/project scope with serviceOverrides.ideConfig.
                 */
                terminalSessionScope: "exercise" as const,
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
        workspace: def.workspace,
        starterFiles: def.workspace?.starterFiles,
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
        expected: resolveShellTaskExpected(def) as any,
        expectedExample: null,
        ideConfig: mergeLearningIdeConfigs(
            terminalWorkspaceIdeConfig,
            def.serviceOverrides ?? null,
        ),
    });
};
