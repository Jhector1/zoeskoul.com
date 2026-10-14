import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import { buildSourceChecksExpectedExample } from "@zoeskoul/curriculum-runtime/expected-example";
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

    const language =
        def.language ??
        def.workspace?.language ??
        (def as any).topicRuntimeDefaults?.language ??
        "web";
    const entryFile =
        def.entryFile ??
        def.workspace?.entryFile ??
        def.workspace?.entryFilePath ??
        def.workspace?.mainFile ??
        def.workspace?.mainFilePath ??
        (language === "web" ? "index.html" : undefined);
    const expectedExample = buildSourceChecksExpectedExample({
        def,
        resolved,
        language,
        runtimeKind: def.runtime?.kind ?? (def as any).topicRuntimeDefaults?.kind,
        entryPath: entryFile,
        solutionFiles: Array.isArray(solutionFiles) ? solutionFiles : undefined,
        tests: Array.isArray(def.recipe?.tests)
            ? def.recipe.tests
            : Array.isArray((def as any).tests)
                ? (def as any).tests
                : [],
    });

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language,
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
            entryFile,
        help: resolved.help,
        hint: resolved.hint,
        expected: {
            kind: "code_input",
            strategy: "programming",
            language,
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
        expectedExample,
        ideConfig: def.serviceOverrides ?? null,
    });
};
