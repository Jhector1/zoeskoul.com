import {
    cleanRuntimeCode,
    makeCodeInputOut,
    starterCodeForGeneratedExercise
} from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import type { ManifestCodeInput } from "@/lib/subjects/_core/manifestTypes";
import { buildTerminalExpectedExample } from "./expectedExample";
import { buildFixedTestsExpected } from "@zoeskoul-code-input-expected";

export const buildFixedTestsRecipe: RecipeHandler<any> = (
    def: ManifestCodeInput & {
        recipe: {
            type: "fixed_tests";
            tests: any[];
            solutionCode?: string;
            solutionFiles?: unknown;
        };
    },    args,
    resolved,
) => {
    const expected = buildFixedTestsExpected(
        def.recipe,
        def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
    );
    const solutionFiles =
        (def as any).solutionFiles ??
        (def.recipe as any).solutionFiles ??
        (def.workspace as any)?.solutionFiles;

    const expectedWithRevealFiles = {
        ...(expected as any),
        ...(typeof (expected as any).solutionCode === "string"
            ? {}
            : typeof def.recipe.solutionCode === "string"
                ? { solutionCode: def.recipe.solutionCode }
                : {}),
        ...(solutionFiles !== undefined ? { solutionFiles } : {}),
    };
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
        fixedSqlDialect: def.fixedSqlDialect,
        expected: expectedWithRevealFiles as any,        expectedExample,
        ideConfig: def.serviceOverrides ?? null,
    });
};
