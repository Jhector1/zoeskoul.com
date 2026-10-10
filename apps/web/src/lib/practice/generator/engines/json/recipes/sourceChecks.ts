import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";

export const buildSourceChecksRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const sourceChecks = Array.isArray((def as any).sourceChecks)
        ? (def as any).sourceChecks
        : [];

    if (sourceChecks.length < 1) {
        throw new Error(`source_checks recipe "${def.id}" is missing sourceChecks`);
    }

    const solutionFiles =
        (def as any).solutionFiles ??
        def.recipe?.solutionFiles;

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language: def.language ?? "web",
        workspace: def.workspace,
        starterFiles: def.workspace?.starterFiles,
        files: (def as any).files ?? def.workspace?.files,
        initialFiles: (def as any).initialFiles ?? def.workspace?.initialFiles,
        workspaceFiles: (def as any).workspaceFiles ?? def.workspace?.workspaceFiles,
        initialStdin: "",
        entryFile:
            def.entryFile ??
            def.workspace?.entryFile ??
            def.workspace?.entryFilePath ??
            def.workspace?.mainFile ??
            def.workspace?.mainFilePath ??
            "index.html",
        help: resolved.help,
        hint: resolved.hint,
        expected: {
            kind: "code_input",
            strategy: "programming",
            language: "web",
            checkMode: "source",
            sourceChecks,
            ...(def.workspaceExpectations ?? def.workspace?.workspaceExpectations
                ? {
                    workspaceExpectations:
                        def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
                  }
                : {}),
            solutionCode: def.recipe?.solutionCode,
            ...(solutionFiles !== undefined ? { solutionFiles } : {}),
        } as any,
        expectedExample: null,
        ideConfig: def.serviceOverrides ?? null,
    });
};
