import {
    cleanRuntimeCode,
    makeCodeInputOut,
    starterCodeForGeneratedExercise
} from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { buildTerminalExpectedExample } from "./expectedExample";
import {
    buildTemplateIoExpected,
    resolveTemplateIoVars,
} from "@zoeskoul-code-input-expected";

export const buildTemplateIoRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const vars = resolveTemplateIoVars({
        recipe: def.recipe,
        rng: args.rng,
    });

    const expected = buildTemplateIoExpected({
        recipe: def.recipe,
        vars,
        workspaceExpectations:
            def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
    });

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
        expected: expected as any,
        expectedExample,
        ideConfig: def.serviceOverrides ?? null,
    });
};
