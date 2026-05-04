import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import type { ManifestCodeInput } from "@/lib/subjects/_core/manifestTypes";
import { buildTerminalExpectedExample } from "./expectedExample";
import { buildFixedTestsExpected } from "@zoeskoul-code-input-expected";

export const buildFixedTestsRecipe: RecipeHandler<any> = (
    def: ManifestCodeInput & { recipe: { type: "fixed_tests"; tests: any[]; solutionCode?: string } },
    args,
    resolved,
) => {
    const expected = buildFixedTestsExpected(def.recipe);
    const tests = expected.tests;

    const expectedExample = buildTerminalExpectedExample({
        def,
        resolved,
        tests,
    });

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language: def.language ?? "python",
        starterCode: resolved.starterCode,

        workspace: def.workspace,
        starterFiles: def.starterFiles,
        initialStdin: def.initialStdin,
        entryFile:
            def.entryFile ??
            def.workspace?.entryFile ??
            def.workspace?.entryFilePath ??
            def.workspace?.mainFile ??
            def.workspace?.mainFilePath,

        help: resolved.help,
        hint: resolved.hint,
        fixedSqlDialect: def.fixedSqlDialect,
        expected: expected as any,
        expectedExample,
        ideConfig: def.serviceOverrides ?? null,
    });
};