import {
    cleanRuntimeCode,
    makeCodeInputOut,
    starterCodeForGeneratedExercise
} from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { buildSemanticExpected } from "@zoeskoul-code-input-expected";

export const buildSemanticRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const expected = buildSemanticExpected(
        def.recipe,
        def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
    );

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language: def.language ?? def.recipe.language ?? "python",
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
        expectedExample: null,
        ideConfig: def.serviceOverrides ?? null,
    });
};
